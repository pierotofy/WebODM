from django.test import TestCase
from app import net
import urllib3.util.connection as ul3conn
import requests


class TestNet(TestCase):
    def setUp(self):
        pass

    def test_net_functions(self):
        from webodm import settings

        # DNS fallback turned off by default
        self.assertIsNone(settings.DNS_RESOLUTION_FALLBACK)
        self.assertFalse(net.is_dns_resolution_problem(Exception("[Errno 11002] Lookup timed out")))

        settings.DNS_RESOLUTION_FALLBACK = ["8.8.8.8"]
        self.assertTrue(net.is_dns_resolution_problem(Exception("[Errno 11002] Lookup timed out")))
        self.assertFalse(net.is_dns_resolution_problem(Exception("Some other error")))
        
        self.assertFalse(net.patched)
        self.assertEqual(ul3conn.create_connection, net.create_connection_orig)

        # Success patch
        self.assertTrue(net.patch_dns_resolution())

        self.assertTrue(net.patched)
        self.assertEqual(ul3conn.create_connection, net.create_connection_custom_dns)

        # Already patched
        self.assertFalse(net.patch_dns_resolution())

        # Should affect all requests library calls
        r = requests.get("https://webodm.org")
        self.assertEqual(r.status_code, 200)
        self.assertTrue('webodm.org' in net.dns_cache)

        settings.DNS_RESOLUTION_FALLBACK = None
        self.assertTrue(net.unpatch_dns_resolution())
        self.assertEqual(ul3conn.create_connection, net.create_connection_orig)
        self.assertFalse(net.patched)

        # Already unpatched
        self.assertFalse(net.unpatch_dns_resolution())