
from Acquire.Service import create_return_value

from Acquire.Identity import Authorisation

from Acquire.Storage import UserDrives

from Acquire.ObjectStore import list_to_string


def run(args):
    """Call this function to return a list of DriveMetas for the
       top-level drives accessible to the authorising user
    """

    authorisation = Authorisation.from_data(args["authorisation"])

    drives = UserDrives(authorisation=authorisation)

    try:
        drive_uid = args["drive_uid"]
    except:
        drive_uid = None

    return_value = create_return_value()

    return_value["drives"] = list_to_string(
                                drives.list_drives(drive_uid=drive_uid))

    return return_value
