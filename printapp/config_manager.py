"""
Config Manager for EatEasy Printer Agent
Handles saving/loading configuration from JSON file
"""
import os
import json
import platform

def get_config_dir():
    """Get OS-appropriate config directory."""
    system = platform.system()
    if system == "Windows":
        base = os.environ.get("APPDATA", os.path.expanduser("~"))
    else:  # macOS / Linux
        base = os.path.expanduser("~")
    
    config_dir = os.path.join(base, "EatEasyPrinter")
    os.makedirs(config_dir, exist_ok=True)
    return config_dir

def get_config_path():
    """Get full path to config file."""
    return os.path.join(get_config_dir(), "config.json")

DEFAULT_CONFIG = {
    "api_url": "https://eateasy-backend.azurewebsites.net",
    "admin_username": "admin",
    "admin_password": "",
    "printer_ip": "192.168.1.200",
    "printer_port": 9100,
}

def load_config():
    """Load config from JSON file, return defaults if not found."""
    config_path = get_config_path()
    try:
        if os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                saved = json.load(f)
                # Merge with defaults (in case new keys added)
                return {**DEFAULT_CONFIG, **saved}
    except Exception as e:
        print(f"Error loading config: {e}")
    return DEFAULT_CONFIG.copy()

def save_config(config: dict):
    """Save config to JSON file."""
    config_path = get_config_path()
    try:
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving config: {e}")
        return False
