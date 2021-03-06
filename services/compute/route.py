

def compute_functions(function, args):
    """These are all of the additional functions for the compute service"""
    if function == "submit_job":
        from compute.submit_job import run as _submit_job
        return _submit_job(args)
    elif function == "get_job":
        from compute.get_job import run as _get_job
        return _get_job(args)
    elif function == "get_pending_job_uids":
        from compute.get_pending_job_uids import run as _get_job_uids
        return _get_job_uids(args)
    elif function == "set_cluster":
        from compute.set_cluster import run as _set_cluster
        return _set_cluster(args)
    else:
        from admin.handler import MissingFunctionError
        raise MissingFunctionError()


if __name__ == "__main__":
    import fdk
    from admin.handler import create_async_handler
    fdk.handle(create_async_handler(compute_functions))
