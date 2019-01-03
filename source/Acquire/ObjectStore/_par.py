
import datetime as _datetime
import json as _json
import os as _os

try:
    import pycurl as _pycurl
except:
    _pycurl = None

from io import BytesIO as _BytesIO

from ._errors import PARError, PARTimeoutError, PARPermissionsError, \
                     PARReadError, PARWriteError

__all__ = ["PAR", "BucketReader", "BucketWriter", "ObjectReader",
           "ObjectWriter"]


class PAR:
    """This class holds the result of a pre-authenticated request
       (a PAR - also called a pre-signed request). This holds a URL
       at which an object (or entire bucket) in the object store
       can be accessed. The PAR has a lifetime.

       This object can safely be saved and/or transmitted from
       the server to the client
    """
    def __init__(self, url=None, key=None,
                 expires_timestamp=0, is_writeable=False,
                 driver=None):
        """Construct a PAR result by passing in the URL at which the
           object can be accessed, the UTC timestamp when this expires,
           whether this is writeable, and (optionally) 'key' for the
           object that is accessed (if this is not supplied then an
           entire bucket is accessed). If 'is_writeable' then read/write
           access has been granted. Otherwise access is read-only.
           This also records the type of object store behind this PAR
           in the free-form string 'driver'
        """
        self._url = url
        self._key = key
        self._expires_timestamp = expires_timestamp
        self._driver = driver

        if is_writeable:
            self._is_writeable = True
        else:
            self._is_writeable = False

    def __str__(self):
        try:
            my_url = self.url()
        except:
            return "PAR( expired )"

        if self._key is None:
            return "PAR( bucket=True, url=%s, seconds_remaining=%s )" % \
                (my_url, self.seconds_remaining(buffer=0))
        else:
            return "PAR( key=%s, url=%s, seconds_remaining=%s )" % \
                (self.key(), my_url, self.seconds_remaining(buffer=0))

    def url(self):
        """Return the URL at which the bucket/object can be accessed. This
           will raise a PARTimeoutError if the url has less than 30 seconds
           of validity left"""
        if self.seconds_remaining(buffer=30) <= 0:
            raise PARTimeoutError(
                "The URL behind this PAR has expired and is no longer valid")

        return self._url

    def is_writeable(self):
        """Return whether or not this PAR gives write access"""
        return self._is_writeable

    def key(self):
        """Return the key for the object this accesses - this is None
           if the PAR grants access to the entire bucket"""
        return self._key

    def is_bucket(self):
        """Return whether or not this PAR is for an entire bucket"""
        return self._key is None

    def is_object(self):
        """Return whether or not this PAR is for a single object"""
        return self._key is not None

    def driver(self):
        """Return the underlying object store driver used for this PAR"""
        return self._driver

    def seconds_remaining(self, buffer=30):
        """Return the number of seconds remaining before this PAR expires.
           This will return 0 if the PAR has already expired. To be safe,
           you should renew PARs if the number of seconds remaining is less
           than 60. This will subtract 'buffer' seconds from the actual
           validity to provide a buffer against race conditions (function
           says this is valid when it is not)
        """
        now = _datetime.datetime.utcnow()
        expires = _datetime.datetime.utcfromtimestamp(self._expires_timestamp)

        buffer = float(buffer)

        if buffer < 0:
            buffer = 0

        delta = (expires - now).total_seconds() - buffer

        if delta < 0:
            return 0
        else:
            return delta

    def read(self):
        """Return an object that can be used to read data from this PAR"""
        if self.is_bucket():
            return BucketReader(self)
        else:
            return ObjectReader(self)

    def write(self):
        """Return an object that can be used to write data to this PAR"""
        if self.is_bucket():
            return BucketWriter(self)
        else:
            return ObjectWriter(self)


def _url_to_filepath(url):
    """Internal function used to strip the "file://" from the beginning
       of a file url
    """
    return url[7:]


def _read_local(url):
    """Internal function used to read data from the local testing object
       store
    """
    with open("%s._data" % _url_to_filepath(url), "rb") as FILE:
        return FILE.read()


def _read_remote(url):
    """Internal functiom used to read data from a remote URL"""
    if _pycurl is None:
        raise PARError("We need pycurl installed to read remote PARs!")

    buffer = _BytesIO()
    c = _pycurl.Curl()
    c.setopt(c.URL, url)
    c.setopt(c.WRITEDATA, buffer)

    try:
        c.perform()
        c.close()
    except _pycurl.error as e:
        raise PARReadError(
            "Cannot read the remote PAR URL '%s' because of a possible "
            "network issue: curl errorcode %s, message '%s'" %
            (url, e.args[0], e.args[1]))
    except Exception as e:
        raise PARReadError(
            "Cannot read the remote PAR URL '%s' because of a possible "
            "nework issue: %s" % (url, str(e)))

    return buffer.getvalue()


def _list_local(url):
    """Internal function to list all of the objects keys below 'url'"""
    local_dir = _url_to_filepath(url)

    keys = []

    for dirpath, _dirnames, filenames in _os.walk(local_dir):
        local_path = dirpath[len(local_dir):]
        has_local_path = (len(local_path) > 0)

        for filename in filenames:
            if filename.endswith("._data"):
                filename = filename[0:-6]

                if has_local_path:
                    keys.append("%s/%s" % (local_path, filename))
                else:
                    keys.append(filename)

    return keys


def _list_remote(url):
    """Internal function to list all of the objects keys below 'url'"""
    return []


def _write_local(url, data):
    """Internal function used to write data to a local file"""
    filename = "%s._data" % _url_to_filepath(url)

    try:
        with open(filename, 'wb') as FILE:
            FILE.write(data)
            FILE.flush()
    except:
        dir = "/".join(filename.split("/")[0:-1])
        _os.makedirs(dir, exist_ok=True)
        with open(filename, 'wb') as FILE:
            FILE.write(data)
            FILE.flush()


def _write_remote(url, data):
    """Internal function used to write data to the passed remote URL"""
    if _pycurl is None:
        raise PARError("We need pycurl installed to read remote PARs!")

    buffer = _BytesIO()
    c = _pycurl.Curl()
    c.setopt(c.URL, url)
    c.setopt(c.WRITEDATA, buffer)
    c.setopt(c.POSTFIELDS, data)

    try:
        c.perform()
        c.close()
    except _pycurl.error as e:
        raise PARWriteError(
            "Cannot write data to the remote PAR URL '%s' because of a "
            "possible network issue: curl errorcode %s, message '%s'" %
            (url, e.args[0], e.args[1]))
    except Exception as e:
        raise PARWriteError(
            "Cannot write data to the remote PAR URL '%s' because of a "
            "possible nework issue: %s" % (url, str(e)))

    print(buffer.getvalue())


def _join_bucket_and_prefix(url, prefix):
    """Join together the passed url and prefix, returning the
       url directory and the remainig part which is the start
       of the file name
    """
    if prefix is None:
        return url

    parts = prefix.split("/")

    return ("%s/%s" % (url, "/".join(parts[0:-2])), parts[-1])


class BucketReader:
    """This class provides functions to enable reading data from a
       bucket via a PAR
    """
    def __init__(self, par=None):
        if par:
            if not isinstance(par, PAR):
                raise TypeError(
                    "You can only create a BucketReader from a PAR")
            elif not par.is_bucket():
                raise ValueError(
                    "You can only create a BucketReader from a PAR that "
                    "represents an entire bucket: %s" % par)

            self._par = par
        else:
            self._par = None

    def get_object(self, key):
        """Return the binary data contained in the key 'key' in the
           passed bucket"""
        if self._par is None:
            raise PARError("You cannot read data from an empty PAR")

        url = "%s/%s" % (self._par.url(), key)

        if url.startswith("file://"):
            return _read_local(url)
        else:
            return _read_remote(url)

    def get_object_as_file(self, key, filename):
        """Get the object contained in the key 'key' in the passed 'bucket'
           and writing this to the file called 'filename'"""
        objdata = self.get_object(key)

        with open(filename, "wb") as FILE:
            FILE.write(objdata)

    def get_string_object(self, key):
        """Return the string in 'bucket' associated with 'key'"""
        data = self.get_object(key)

        try:
            return data.decode("utf-8")
        except Exception as e:
            raise TypeError(
                "The object behind this PAR cannot be converted to a string. "
                "Error is: %s" % str(e))

    def get_object_from_json(self, key):
        """Return an object constructed from json stored at 'key' in
           the passed bucket. This returns None if there is no data
           at this key
        """
        data = None

        try:
            data = self.get_string_object(key)
        except:
            return None

        return _json.loads(data)

    def get_all_object_names(self, prefix=None):
        """Returns the names of all objects in the passed bucket"""
        (url, part) = _join_bucket_and_prefix(self._par.url(), prefix)

        if url.startswith("file://"):
            objnames = _list_local(url)
        else:
            objnames = _list_remote(url)

        # scan the object names returned and discard the ones that don't
        # match the prefix
        matches = []

        if len(part) > 0:
            for objname in objnames:
                if objname.startswith(part):
                    objname = objname[len(part):]

                    while objname.startswith("/"):
                        objname = objname[1:]

                    matches.append(objname)
        else:
            matches = objnames

        return matches

    def get_all_objects(self, prefix=None):
        """Return all of the objects in the passed bucket"""
        names = self.get_all_object_names(prefix)

        objects = {}

        if prefix:
            for name in names:
                objects[name] = self.get_object(
                                    "%s/%s" % (prefix, name))
        else:
            for name in names:
                objects[name] = self.get_object(name)

        return objects

    def get_all_strings(self, prefix=None):
        """Return all of the strings in the passed bucket"""
        objects = self.get_all_objects(prefix)

        names = list(objects.keys())

        for name in names:
            try:
                s = objects[name].decode("utf-8")
                objects[name] = s
            except:
                del objects[name]

        return objects


class BucketWriter(BucketReader):
    """This is an extension of BucketReader that supports writing
       data to any object in a bucket via a PAR
    """
    def __init__(self, par):
        super().__init__(par)

        if self._par is not None:
            if not self._par.is_writeable():
                raise PARPermissionsError(
                    "You cannot create a BucketWriter from a read-only "
                    "PAR: %s" % self._par)

    def set_object(self, key, data):
        """Set the value of 'key' in 'bucket' to binary 'data'"""
        if self._par is None:
            raise PARError("You cannot write data to an empty PAR")

        url = "%s/%s" % (self._par.url(), key)

        if url.startswith("file://"):
            return _write_local(url, data)
        else:
            return _write_remote(url, data)

    def set_object_from_file(self, key, filename):
        """Set the value of 'key' in 'bucket' to equal the contents
           of the file located by 'filename'"""
        with open(filename, "rb") as FILE:
            data = FILE.read()
            self.set_object(key, data)

    def set_string_object(self, key, string_data):
        """Set the value of 'key' in 'bucket' to the string 'string_data'"""
        self.set_object(key, string_data.encode("utf-8"))

    def set_object_from_json(self, key, data):
        """Set the value of 'key' in 'bucket' to equal to contents
           of 'data', which has been encoded to json"""
        self.set_string_object(key, _json.dumps(data))


class ObjectReader:
    """This class provides functions for reading an object via a PAR"""
    def __init__(self, par=None):
        if par:
            if not isinstance(par, PAR):
                raise TypeError(
                    "You can only create an ObjectReader from a PAR")
            elif par.is_bucket():
                raise ValueError(
                    "You can only create an ObjectReader from a PAR that "
                    "represents an object: %s" % par)

            self._par = par
        else:
            self._par = None

    def get_object(self):
        """Return the binary data contained in this object"""
        if self._par is None:
            raise PARError("You cannot read data from an empty PAR")

        url = self._par.url()

        if url.startswith("file://"):
            return _read_local(url)
        else:
            return _read_remote(url)

    def get_object_as_file(self, filename):
        """Get the object contained in this PAR and write this to
           the file called 'filename'"""
        objdata = self.get_object()

        with open(filename, "wb") as FILE:
            FILE.write(objdata)

    def get_string_object(self):
        """Return the object behind this PAR as a string (raises exception
           if it is not a string)'"""
        data = self.get_object()

        try:
            return data.decode("utf-8")
        except Exception as e:
            raise TypeError(
                "The object behind this PAR cannot be converted to a string. "
                "Error is: %s" % str(e))

    def get_object_from_json(self):
        """Return an object constructed from json stored at behind
           this PAR. This returns None if there is no data
           behind this PAR
        """
        data = None

        try:
            data = self.get_string_object()
        except:
            return None

        return _json.loads(data)


class ObjectWriter(ObjectReader):
    """This is an extension of ObjectReader that also allows writing to
       the object via the PAR
    """
    def __init__(self, par=None):
        super().__init__(par=par)

        if self._par is not None:
            if not self._par.is_writeable():
                raise PARPermissionsError(
                    "You cannot create an ObjectWriter from a read-only "
                    "PAR: %s" % self._par)

    def set_object(self, data):
        """Set the value of the object behind this PAR to the binary 'data'"""
        if self._par is None:
            raise PARError("You cannot write data to an empty PAR")

        url = self._par.url()

        if url.startswith("file://"):
            return _write_local(url, data)
        else:
            return _write_remote(url, data)

    def set_object_from_file(self, filename):
        """Set the value of the object behind this PAR to equal the contents
           of the file located by 'filename'"""
        with open(filename, "rb") as FILE:
            data = FILE.read()
            self.set_object(data)

    def set_string_object(self, string_data):
        """Set the value of the object behind this PAR to the
           string 'string_data'
        """
        self.set_object(string_data.encode("utf-8"))

    def set_object_from_json(self, data):
        """Set the value of the object behind this PAR to equal to contents
           of 'data', which has been encoded to json"""
        self.set_string_object(_json.dumps(data))
