
/** Mirror of Acquire.Crypto.Hash.multi_md5 */
Acquire.multi_md5 = function(data1, data2)
{
    return md5(md5(data1) + md5(data2));
}

/** Function used as part of converting a key to a pem file */
Acquire.Private._arrayBufferToBase64String = function(arrayBuffer)
{
    let byteArray = new Uint8Array(arrayBuffer)
    let byteString = ''
    for (let i=0; i<byteArray.byteLength; i++) {
        byteString += String.fromCharCode(byteArray[i])
    }
    return btoa(byteString)
}

/** Function to convert a base64 string to an array buffer */
Acquire.Private._base64StringToArrayBuffer = function(b64str)
{
    let byteStr = atob(b64str)
    let bytes = new Uint8Array(byteStr.length)
    for (let i = 0; i < byteStr.length; i++) {
        bytes[i] = byteStr.charCodeAt(i)
    }
    return bytes.buffer
}

/** Function used to convert binary key date to pem */
Acquire.Private._convertBinaryToPem = function(binaryData, label) {
    let base64Cert = Acquire.Private._arrayBufferToBase64String(binaryData)
    let pemCert = "-----BEGIN " + label + "-----\n"
    let nextIndex = 0
    let lineLength
    while (nextIndex < base64Cert.length) {
        if (nextIndex + 64 <= base64Cert.length) {
        pemCert += base64Cert.substr(nextIndex, 64) + "\n"
        } else {
        pemCert += base64Cert.substr(nextIndex) + "\n"
        }
        nextIndex += 64
    }
    pemCert += "-----END " + label + "-----\n"
    return pemCert
}

/** Function to convert pemfile info binary data used for js crypto */
Acquire.Private._convertPemToBinary = function(pem)
{
    let lines = pem.split('\n')
    let encoded = ''
    for(let i = 0;i < lines.length;i++){
        if (lines[i].trim().length > 0 &&
            lines[i].indexOf('-BEGIN PRIVATE KEY-') < 0 &&
            lines[i].indexOf('-BEGIN ENCRYPTED PRIVATE KEY-') < 0 &&
            lines[i].indexOf('-BEGIN PUBLIC KEY-') < 0 &&
            lines[i].indexOf('-END PRIVATE KEY-') < 0 &&
            lines[i].indexOf('-END ENCRYPTED PRIVATE KEY-') < 0 &&
            lines[i].indexOf('-END PUBLIC KEY-') < 0) {
        encoded += lines[i].trim()
        }
    }
    return Acquire.Private._base64StringToArrayBuffer(encoded)
}

/** Hard code the key size (in bytes) as javascript web crypto doesn't
 *  seem to have a way to query this programatically. 256 bytes (2048 bit)
 *  is used on the server in all of the python functions
*/
Acquire.Private._rsa_key_size = 256;

/** Funcion to import and return the public key from the passed pemfile */
Acquire.Private._importPublicKey = async function(pemKey)
{
    //convert the pem key to binary
    let bin = Acquire.Private._convertPemToBinary(pemKey);

    let encryptAlgorithm = {
        name: "RSA-OAEP",
        modulusLength: 8*Acquire.Private._rsa_key_size,
        publicExponent: 65537,
        extractable: true,
        hash: {
            name: "SHA-256"
        }
    };

    try
    {
        let public_key = await crypto.subtle.importKey(
                            "spki", bin, encryptAlgorithm,
                            true, ["encrypt"]
                            );

        return public_key;
    }
    catch(err)
    {
        throw new Acquire.KeyManipulationError(
            "Cannot import public key!", err);
    }
}


/** Function to import and return the public cert from the passed pemfile */
Acquire.Private._importPublicCert = async function(pemKey)
{
    //convert the pem key to binary
    let bin = Acquire.Private._convertPemToBinary(pemKey);

    let encryptAlgorithm = {
        name: "RSA-OAEP",
        modulusLength: 8*Acquire.Private._rsa_key_size,
        publicExponent: 65537,
        extractable: true,
        hash: {
            name: "SHA-256"
        }
    };

    try
    {
        let public_key = await crypto.subtle.importKey(
                            "spki", bin, encryptAlgorithm,
                            true, ["encrypt"]
                            );

        return public_key;
    }
    catch(err)
    {
        throw new Acquire.KeyManipulationError(
            "Cannot import public certificate!", err);
    }
}

/** Function to convert a public key to a PEM file */
Acquire.Private._exportPublicKey = async function(key) {
    let exported = await window.crypto.subtle.exportKey('spki', key);
    let pem = Acquire.Private._convertBinaryToPem(exported, "PUBLIC KEY");
    return pem;
}

/** Function to import and return the private key from the passed pemfile.
 *  Note that this doesn't, yet, work with encrypted pem files
 */
Acquire.Private._importPrivateKey = async function(pemKey, passphrase)
{
    //convert the pem key to binary
    let bin = Acquire.Private._convertPemToBinary(pemKey);

    let encryptAlgorithm = {
        name: "RSA-OAEP",
        modulusLength: 8*Acquire.Private._rsa_key_size,
        publicExponent: 65537,
        extractable: true,
        hash: {
            name: "SHA-256"
        }
    };

    try
    {
        let private_key = await crypto.subtle.importKey(
                            "spki", bin, encryptAlgorithm,
                            true, ["encrypt", "decrypt", "sign", "verify"]
                            );

        return private_key;
    }
    catch(err)
    {
        throw new Acquire.KeyManipulationError(
            "Cannot import private key", err);
    }
}

/** Function to convert a private key to a PEM file. Currently
 *  this does not encrypt the PEM file. It will one day, when
 *  if will use the supplied passphrase
 */
Acquire.Private._exportPrivateKey = async function(key, passphrase) {
    let exported = await window.crypto.subtle.exportKey('spki', key);
    let pem = Acquire.Private._convertBinaryToPem(exported, "PRIVATE KEY");
    return pem;
}

/** Function that concatenates two arrays together -
 *  thanks to http://2ality.com/2015/10/concatenating-typed-arrays.html
 */
Acquire.Private._concatenate = function(resultConstructor, ...arrays)
{
    let totalLength = 0;
    for (let arr of arrays)
    {
        totalLength += arr.length;
    }

    let result = new resultConstructor(totalLength);
    let offset = 0;
    for (let arr of arrays)
    {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

/*
Thanks to Jon Leighton for the below base64ArrayBuffer function that is
  licensed under MIT

MIT LICENSE
Copyright 2011 Jon Leighton
Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
*/
Acquire.Private._base64ArrayBuffer = function(arrayBuffer)
{
    let base64    = '';
    let encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    let bytes         = new Uint8Array(arrayBuffer);
    let byteLength    = bytes.byteLength;
    let byteRemainder = byteLength % 3;
    let mainLength    = byteLength - byteRemainder;

    let a, b, c, d = undefined;
    let chunk = undefined;

    // Main loop deals with bytes in chunks of 3
    for (let i = 0; i < mainLength; i = i + 3) {
      // Combine the three bytes into a single integer
      chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

      // Use bitmasks to extract 6-bit segments from the triplet
      a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
      b = (chunk & 258048)   >> 12; // 258048   = (2^6 - 1) << 12
      c = (chunk & 4032)     >>  6; // 4032     = (2^6 - 1) << 6
      d = chunk & 63;               // 63       = 2^6 - 1

      // Convert the raw binary segments to the appropriate ASCII encoding
      base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
    }

    // Deal with the remaining bytes and padding
    if (byteRemainder == 1) {
      chunk = bytes[mainLength];

      a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2

      // Set the 4 least significant bits to zero
      b = (chunk & 3)   << 4; // 3   = 2^2 - 1

      base64 += encodings[a] + encodings[b] + '==';
    } else if (byteRemainder == 2) {
      chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];

      a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
      b = (chunk & 1008)  >>  4; // 1008  = (2^6 - 1) << 4

      // Set the 2 least significant bits to zero
      c = (chunk & 15)    <<  2; // 15    = 2^4 - 1

      base64 += encodings[a] + encodings[b] + encodings[c] + '=';
    }

    return base64;
}

/** Function to perform symmetric encryption using fernet - encrypts
 *  'data' with 'key'
 */
Acquire.Private.fernet_encrypt = function(key, data)
{
    let token = new fernet.Token({
        secret: new fernet.Secret(key)
    });

    try
    {
        let encrypted = token.encode(data);
        encrypted = Acquire.string_to_utf8_bytes(encrypted);
        return encrypted;
    }
    catch(err)
    {
        throw new Acquire.EncryptionError("Cannot encrypt data", err);
    }
}

/** Function to perform symmetric decryption using fernet - decrypts
 *  'data' with 'key'
 */
Acquire.Private.fernet_decrypt = function(key, data)
{
    let token = new fernet.Token({
        secret: new fernet.Secret(key),
        token: Acquire.utf8_bytes_to_string(data),
        ttl: 0
    });

    try
    {
        let result = token.decode();
        return result;
    }
    catch(err)
    {
        throw new Acquire.DecryptionError("Cannot decrypt data", err);
    }
}

/** Randomly generate a good symmetric key */
Acquire.Private._generate_symmetric_key = function()
{
    let array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    let secret = Acquire.Private._base64ArrayBuffer(array);
    return secret;
}

/** Function that verifies the signature of the passed message signed
 *  using the private counterpart of this public key
 */
Acquire.Private._verifySignature = async function(key, signature, data)
{
    key = await key;

    // this is something we will attempt at a much later point!
}

/** Function that encrypts the passed data with the passed public key */
Acquire.Private._encryptData = async function(key, data)
{
    try
    {
        key = await key;

        // we will encrypt the message using fernet, and send that prefixed
        // by the RSA-encrypted secret. The fernet secret is a random 32 bytes
        // that are then base64 encoded
        let array = new Uint8Array(32);
        window.crypto.getRandomValues(array);
        let secret = Acquire.Private._base64ArrayBuffer(array);

        let token = new fernet.Token({
            secret: new fernet.Secret(secret)
        });

        let encrypted = token.encode(data);

        // now we will encrypt the fernet secret using the public key
        let result = await window.crypto.subtle.encrypt(
                        {
                            name: "RSA-OAEP"
                        },
                        key,
                        Acquire.string_to_utf8_bytes(secret).buffer
                    );

        // finally concatenate both outputs together into a single binary array
        let output = new Uint8Array(result);
        output = Acquire.Private._concatenate(
                                    Uint8Array,
                                    output,
                                    Acquire.string_to_utf8_bytes(encrypted));

        return output;
    }
    catch(err)
    {
        throw new Acquire.EncryptionError(
            "Failed to encrypt the data!", err);
    }
}

/** Function that decrypts the passed data with the passed private key */
Acquire.Private._decryptData = async function(key, data)
{
    try
    {
        // the first rsa_key_size bytes hold the rsa-encrypted fernet
        // secret to decode the rest of the message
        let secret = await window.crypto.subtle.decrypt(
                    {
                        name: "RSA-OAEP",
                    },
                    key,
                    data.slice(0,Acquire.Private._rsa_key_size))
                ;

        secret = Acquire.utf8_bytes_to_string(secret);

        if (data.length <= Acquire.Private._rsa_key_size){
            // the secret is the message - no fernet decoding needed
            return secret;
        }

        data = Acquire.utf8_bytes_to_string(
                                    data.slice(Acquire.Private._rsa_key_size,
                                            data.length));

        let token = new fernet.Token({
            secret: new fernet.Secret(secret),
            token: data,
            ttl: 0
        });

        let result = token.decode();

        return result;
    }
    catch(err)
    {
        throw new Acquire.DecryptionError("Cannot decrypt data", err);
    }
}

/** Function to generate a public/private key pair used for
 *  encrypting and decrypting
 */
Acquire.Private._generateKeypair = async function()
{
    try
    {
        let keys = await window.crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 8*Acquire.Private._rsa_key_size,
                publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
                hash: {name: "SHA-256"}
            },
            true,  /* the key must be extractable */
            ["encrypt", "decrypt"]
        );

        await keys;
        return keys;
    }
    catch(err)
    {
        throw new Acquire.KeyManipulationError("Unable to generate keys", err);
    }
}

/** Function to generate a public/private key pair used for
 *  signing and verifying
 */
Acquire.Private._generateCertpair = async function()
{
    try
    {
        let keys = await window.crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 8*Acquire.Private._rsa_key_size,
                publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
                hash: {name: "SHA-256"}
            },
            true,  /* the key must be extractable */
            ["sign", "verify"]
        );

        return keys;
    }
    catch(err)
    {
        throw new Acquire.KeyManipulationError("Unable to generate keys", err);
    }
}

/** This class provides a simple handle to a private key. This
 *  can be used to decrypt data for Acquire, and also to
 *  sign messages
 */
Acquire.PrivateKey = class
{
    constructor(auto_generate=true)
    {
        if (auto_generate)
        {
            this._keys = Acquire.Private._generateKeypair();
        }
        else
        {
            this._keys = undefined;
        }
    }

    is_null()
    {
        return this._keys == undefined;
    }

    async fingerprint()
    {
        if (this.is_null()){ return undefined; }
        else
        {
            let key = await this.public_key();
            return await key.fingerprint();
        }
    }

    async public_key()
    {
        if (this.is_null()){ return undefined;}
        else
        {
            let keys = await this._keys;
            return new Acquire.PublicKey(keys.publicKey);
        }
    }

    async bytes(passphrase)
    {
        if (this.is_null()){ return undefined; }
        else
        {
            let keys = await this._keys;
            let pem = await Acquire.Private._exportPrivateKey(
                                                keys.privateKey, passphrase);
            return pem;
        }
    }

    async encrypt(message)
    {
        if (this.is_null()){ return undefined;}
        else
        {
            let pubkey = await this.public_key();
            return await pubkey.encrypt(message);
        }
    }

    async decrypt(message)
    {
        if (this.is_null()){ return undefined;}
        else
        {
            let keys = await this._keys;
            return await Acquire.Private._decryptData(keys.privateKey,
                                                      message);
        }
    }

    async to_data(passphrase)
    {
        if (this.is_null()){ return undefined; }
        else
        {
            let bytes = await this.bytes(passphrase);

            let data = {};
            data["bytes"] = Acquire.bytes_to_string(bytes);

            return data;
        }
    }

    static async read_bytes(bytes, passphrase)
    {
        let keys = await Acquire.Private._importPrivateKey(bytes,
                                                           passphrase);

        let privkey = new Acquire.PrivateKey(false);
        privkey._keys = keys;
        return privkey;
    }

    static async from_data(data, passphrase)
    {
        let pem = Acquire.string_to_bytes(data["bytes"]);
        pem = Acquire.utf8_bytes_to_string(pem);
        return await Acquire.PrivateKey.read_bytes(pem, passphrase);
    }
}

/** This class provides a simple handle to a public key. This
 *  can be used to encrypt data for Acquire and verify signatures
 */
Acquire.PublicKey = class
{
    constructor(public_key=undefined)
    {
        this._key = public_key;
    }

    is_null()
    {
        return this._key == undefined;
    }

    async bytes()
    {
        if (this.is_null()){ return undefined; }
        else
        {
            let pem = await Acquire.Private._exportPublicKey(this._key);
            return pem;
        }
    }

    async fingerprint()
    {
        if (this.is_null()){ return undefined; }
        else
        {
            //the fingerprint is an md5 of the pem
            let b = await this.bytes();
            let m = md5(b);

            return m.match(/(..?)/g).join(":");
        }
    }

    async verify(signature, message)
    {
        if (this.is_null()){ return undefined; }
        else
        {
            await Acquire.Private._verifySignature(this._key,
                                                   signature, message);
        }
    }

    async encrypt(message)
    {
        return await Acquire.Private._encryptData(this._key, message);
    }

    async to_data()
    {
        if (this.is_null()){ return undefined; }

        let pem = await Acquire.Private._exportPublicKey(this._key);
        let b = Acquire.bytes_to_string(Acquire.string_to_utf8_bytes(pem));

        let data = {};
        data["bytes"] = b;

        return data;
    }

    static async from_data(data, is_certificate=false)
    {
        if (data == undefined){ return undefined;}

        let key = new Acquire.PublicKey();

        let b = data["bytes"];

        let pem = Acquire.string_to_bytes(data["bytes"]);
        pem = Acquire.utf8_bytes_to_string(pem);

        if (is_certificate)
        {
            key._key = await Acquire.Private._importPublicCert(pem);
        }
        else
        {
            key._key = await Acquire.Private._importPublicKey(pem);
        }

        return key;
    }
}

Acquire.SymmetricKey = class
{
    constructor({symmetric_key=undefined, auto_generate=true} = {})
    {
        this._symkey = undefined;

        if (symmetric_key)
        {
            this._symkey = Acquire.string_to_encoded(md5(symmetric_key));
        }
        else
        {
            if (auto_generate)
            {
                this._symkey = Acquire.Private._generate_symmetric_key();
            }
        }
    }

    fingerprint()
    {
        if (!self._symkey)
        {
            return undefined;
        }

        let m = md5(self._symkey);

        return m.match(/(..?)/g).join(":");
    }

    encrypt(message)
    {
        if (!this._symkey)
        {
            this._symkey = Acquire.Private._generate_symmetric_key();
        }

        return Acquire.Private.fernet_encrypt(this._symkey, message);
    }

    decrypt(message)
    {
        if (!this._symkey)
        {
            throw new Acquire.DecryptionError(
                                      "You cannot decrypt a message " +
                                      "with a null key!");
        }

        return Acquire.Private.fernet_decrypt(this._symkey, message);
    }
}
