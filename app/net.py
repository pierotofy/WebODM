import urllib3.util.connection as ul3conn
import dns.resolver
from webodm import settings

dns_cache = {}
patched = False
create_connection_orig = ul3conn.create_connection

def is_dns_resolution_problem(e):
    if settings.DNS_RESOLUTION_FALLBACK:
        return "[Errno 11002] Lookup timed out" in str(e) #or "[Errno 111] Connection refused" in str(e)
    return False

def patch_dns_resolution():
    global patched
    if patched:
        return False # Already enabled

    # Calling this method overrides the DNS resolution process
    # by calling dnspython instead of relying on the system network defaults
    # because on some machines, DNS misconfigurations, AV software and other problems
    # cause external network name resolution to fail.

    # Inject the patch globally
    ul3conn.create_connection = create_connection_custom_dns
    patched = True

    return True # Success

def unpatch_dns_resolution():
    global patched
    if not patched:
        return False
    
    ul3conn.create_connection = create_connection_orig
    patched = False

    return True # Success

def create_connection_custom_dns(address, *args, **kwargs):
    if not settings.DNS_RESOLUTION_FALLBACK:
        return create_connection_orig(address, *args, **kwargs)

    host, port = address
    if host in dns_cache:
        resolved = dns_cache[host]
    else:
        resolver = dns.resolver.Resolver()
        resolver.nameservers = settings.DNS_RESOLUTION_FALLBACK
        try:
            answers = resolver.resolve(host, 'A')
            resolved = answers[0].to_text()
            dns_cache[host] = resolved
        except Exception:
            resolved = host

    return create_connection_orig((resolved, port), *args, **kwargs)

