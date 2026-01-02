import os
from datetime import datetime, timedelta
from pathlib import Path
import socket

def generate_self_signed_cert(cert_dir="certificates"):
    """
    Generates a self-signed separate key and certificate using standard library (if strictly needed) 
    or just simplistic OpenSSL-like generation if we want to avoid complex dependencies.
    However, standard Python library 'ssl' doesn't create certs easily without 'cryptography' library.
    
    Since we are in a "no-dependency" constrained environment regarding system tools, 
    but we DO have 'fastapi', 'uvicorn' installed in backend which might imply we have pip.
    
    Wait, the user's backend setup installed 'requirements.txt'. 
    Let's check if we can use a pure python solution that doesn't require 'cryptography' if possible,
    OR better, since we have a python environment, we can rely on standard approaches.
    
    Actually, generating a usable SSL cert without 'cryptography' or 'OpenSSL' binary is hard in pure Python stdlib.
    But often 'cryptography' is pulled in by other libs (like pyopenssl, or some async drivers).
    
    Let's try to generate a dummy cert or check if we can use a simple ad-hoc generation.
    
    Actually, looking at 'requirements.txt' from previous output:
    "Collecting fastapi... uvicorn... openai-whisper..."
    
    'uvicorn' often can generate simple certs or we can just use a simple Python script using 'cryptography' if available. 
    If not, we might need to install it.
    
    Let's assume we can use a simple 'trustme' or 'cryptography' if we pip install it.
    BUT, I want to avoid extra installs if possible.
    
    Actually, `werkzeug` (if present) has one, but we are using FastAPI.
    
    Let's write a script that attempts to use 'cryptography' module (standard for this).
    If not present, we will crash. But wait, `easy_setup` installs backend reqs first.
    So we can `pip install cryptography` in the virtualenv if needed.
    
    OR easier: The user just needs a dev cert.
    
    Let's write a robust script that generates it.
    """
    
    # We will try to import cryptography. If not found, we install it since we are in setup phase.
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization
    except ImportError:
        print("Installing cryptography library for certificate generation...")
        import subprocess
        import sys
        subprocess.check_call([sys.executable, "-m", "pip", "install", "cryptography"])
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization

    # Create directory
    Path(cert_dir).mkdir(exist_ok=True)
    key_path = Path(cert_dir) / "key.pem"
    cert_path = Path(cert_dir) / "cert.pem"

    if key_path.exists() and cert_path.exists():
        print(f"Certificates already exist in {cert_dir}")
        return

    print(f"Generating new certificates in {cert_dir}...")

    # Generate key
    key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    # Generate cert
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, u"TH"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, u"Bangkok"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, u"Bangkok"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, u"EatEasy"),
        x509.NameAttribute(NameOID.COMMON_NAME, u"EatEasyLocal"),
    ])

    cert = x509.CertificateBuilder().subject_name(
        subject
    ).issuer_name(
        issuer
    ).public_key(
        key.public_key()
    ).serial_number(
        x509.random_serial_number()
    ).not_valid_before(
        datetime.utcnow()
    ).not_valid_after(
        # 1 year validity
        datetime.utcnow() + timedelta(days=365)
    ).add_extension(
        x509.SubjectAlternativeName([x509.DNSName(u"localhost")]),
        critical=False,
    ).sign(key, hashes.SHA256())

    # Write key
    with open(key_path, "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))

    # Write cert
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    print("Certificate generation complete.")

if __name__ == "__main__":
    generate_self_signed_cert()
