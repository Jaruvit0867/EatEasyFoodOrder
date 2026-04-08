"""
EatEasy Printer Agent - Desktop Application
Cross-platform GUI for thermal printer management
"""
import customtkinter as ctk
from config_manager import load_config, save_config
from printer_core import PrinterAgent
import threading

# Appearance
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")


class EatEasyPrinterApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        
        # Window setup
        self.title("🖨️ EatEasy Printer Agent")
        self.geometry("520x750")
        self.minsize(500, 700)
        self.resizable(True, True)
        
        # State
        self.config = load_config()
        self.agent = None
        
        # Build UI
        self.create_widgets()
        self.load_settings_to_ui()
        
    def create_widgets(self):
        # Main container with padding
        self.main_frame = ctk.CTkFrame(self, corner_radius=0)
        self.main_frame.pack(fill="both", expand=True, padx=20, pady=20)
        
        # Header
        self.header = ctk.CTkLabel(
            self.main_frame, 
            text="🖨️ EatEasy Printer Agent",
            font=ctk.CTkFont(size=24, weight="bold")
        )
        self.header.pack(pady=(0, 20))
        
        # === Settings Section ===
        self.settings_frame = ctk.CTkFrame(self.main_frame)
        self.settings_frame.pack(fill="x", pady=(0, 10))
        
        self.settings_label = ctk.CTkLabel(
            self.settings_frame,
            text="⚙️ Settings",
            font=ctk.CTkFont(size=16, weight="bold")
        )
        self.settings_label.pack(anchor="w", padx=15, pady=(15, 15))
        
        # Form container
        self.form_frame = ctk.CTkFrame(self.settings_frame, fg_color="transparent")
        self.form_frame.pack(fill="x", padx=15)
        
        # Base URL
        self.api_url_label = ctk.CTkLabel(self.form_frame, text="Base URL:", anchor="w")
        self.api_url_label.pack(fill="x")
        self.api_url_entry = ctk.CTkEntry(self.form_frame, placeholder_text="https://your-app.azurestaticapps.net")
        self.api_url_entry.pack(fill="x", pady=(2, 12))
        
        # Username & Password row
        self.auth_row = ctk.CTkFrame(self.form_frame, fg_color="transparent")
        self.auth_row.pack(fill="x", pady=(0, 12))
        
        self.user_col = ctk.CTkFrame(self.auth_row, fg_color="transparent")
        self.user_col.pack(side="left", fill="x", expand=True, padx=(0, 10))
        self.username_label = ctk.CTkLabel(self.user_col, text="Username:", anchor="w")
        self.username_label.pack(fill="x")
        self.username_entry = ctk.CTkEntry(self.user_col, placeholder_text="admin")
        self.username_entry.pack(fill="x", pady=(2, 0))
        
        self.pass_col = ctk.CTkFrame(self.auth_row, fg_color="transparent")
        self.pass_col.pack(side="left", fill="x", expand=True)
        self.password_label = ctk.CTkLabel(self.pass_col, text="Password:", anchor="w")
        self.password_label.pack(fill="x")
        self.password_entry = ctk.CTkEntry(self.pass_col, show="•", placeholder_text="password")
        self.password_entry.pack(fill="x", pady=(2, 0))
        
        # Printer IP/Port row
        self.printer_row = ctk.CTkFrame(self.form_frame, fg_color="transparent")
        self.printer_row.pack(fill="x", pady=(0, 5))
        
        self.ip_col = ctk.CTkFrame(self.printer_row, fg_color="transparent")
        self.ip_col.pack(side="left", fill="x", expand=True, padx=(0, 10))
        self.printer_ip_label = ctk.CTkLabel(self.ip_col, text="Printer IP:", anchor="w")
        self.printer_ip_label.pack(fill="x")
        self.printer_ip_entry = ctk.CTkEntry(self.ip_col, placeholder_text="192.168.1.200")
        self.printer_ip_entry.pack(fill="x", pady=(2, 0))
        
        self.port_col = ctk.CTkFrame(self.printer_row, fg_color="transparent")
        self.port_col.pack(side="left")
        self.port_label = ctk.CTkLabel(self.port_col, text="Port:", anchor="w")
        self.port_label.pack(fill="x")
        self.printer_port_entry = ctk.CTkEntry(self.port_col, width=80, placeholder_text="9100")
        self.printer_port_entry.pack(pady=(2, 0))
        
        # === Buttons Row (Save + Start + Stop) ===
        self.btn_row = ctk.CTkFrame(self.settings_frame, fg_color="transparent")
        self.btn_row.pack(pady=15)
        
        self.save_btn = ctk.CTkButton(
            self.btn_row,
            text="💾 Save",
            command=self.save_settings,
            fg_color="#2d5a27",
            hover_color="#3d7a37",
            width=120,
            height=40
        )
        self.save_btn.pack(side="left", padx=(0, 10))
        
        self.start_btn = ctk.CTkButton(
            self.btn_row,
            text="▶️ START",
            command=self.start_agent,
            fg_color="#1a73e8",
            hover_color="#1557b0",
            width=140,
            height=40,
            font=ctk.CTkFont(size=14, weight="bold")
        )
        self.start_btn.pack(side="left", padx=(0, 10))
        
        self.stop_btn = ctk.CTkButton(
            self.btn_row,
            text="⏹️ STOP",
            command=self.stop_agent,
            fg_color="#dc3545",
            hover_color="#a71d2a",
            width=140,
            height=40,
            font=ctk.CTkFont(size=14, weight="bold"),
            state="disabled"
        )
        self.stop_btn.pack(side="left")
        
        # === Status Section ===
        self.status_frame = ctk.CTkFrame(self.main_frame)
        self.status_frame.pack(fill="both", expand=True)
        
        self.status_label = ctk.CTkLabel(
            self.status_frame,
            text="📊 Status",
            font=ctk.CTkFont(size=16, weight="bold")
        )
        self.status_label.pack(anchor="w", padx=15, pady=(15, 10))
        
        # Status indicator
        self.status_indicator = ctk.CTkLabel(
            self.status_frame,
            text="● Stopped",
            text_color="#ff6b6b",
            font=ctk.CTkFont(size=14)
        )
        self.status_indicator.pack(anchor="w", padx=15)
        
        # Log textbox
        self.log_text = ctk.CTkTextbox(self.status_frame, height=120, state="disabled")
        self.log_text.pack(fill="both", expand=True, padx=15, pady=(10, 15))
    
    def load_settings_to_ui(self):
        """Load saved settings into UI fields."""
        self.api_url_entry.insert(0, self.config.get("api_url", ""))
        self.username_entry.insert(0, self.config.get("admin_username", ""))
        self.password_entry.insert(0, self.config.get("admin_password", ""))
        self.printer_ip_entry.insert(0, self.config.get("printer_ip", ""))
        self.printer_port_entry.insert(0, str(self.config.get("printer_port", 9100)))
    
    def save_settings(self):
        """Save settings from UI to config file."""
        self.config["api_url"] = self.api_url_entry.get().strip()
        self.config["admin_username"] = self.username_entry.get().strip()
        self.config["admin_password"] = self.password_entry.get()
        self.config["printer_ip"] = self.printer_ip_entry.get().strip()
        try:
            self.config["printer_port"] = int(self.printer_port_entry.get().strip())
        except:
            self.config["printer_port"] = 9100
        
        if save_config(self.config):
            self.log("✅ Settings saved!")
        else:
            self.log("❌ Failed to save settings")
    
    def log(self, message: str):
        """Add message to log display (thread-safe)."""
        def update():
            self.log_text.configure(state="normal")
            self.log_text.insert("end", message + "\n")
            self.log_text.see("end")
            self.log_text.configure(state="disabled")
        self.after(0, update)
    
    def start_agent(self):
        """Start the printer agent."""
        # Save settings first
        self.save_settings()
        
        # Create and start agent
        self.agent = PrinterAgent(self.config, log_callback=self.log)
        self.agent.start()
        
        # Update UI
        self.status_indicator.configure(text="● Running", text_color="#51cf66")
        self.start_btn.configure(state="disabled")
        self.stop_btn.configure(state="normal")
        
        # Disable settings while running
        self.api_url_entry.configure(state="disabled")
        self.username_entry.configure(state="disabled")
        self.password_entry.configure(state="disabled")
        self.printer_ip_entry.configure(state="disabled")
        self.printer_port_entry.configure(state="disabled")
        self.save_btn.configure(state="disabled")
    
    def stop_agent(self):
        """Stop the printer agent."""
        if self.agent:
            self.agent.stop()
            self.agent = None
        
        # Update UI
        self.status_indicator.configure(text="● Stopped", text_color="#ff6b6b")
        self.start_btn.configure(state="normal")
        self.stop_btn.configure(state="disabled")
        
        # Re-enable settings
        self.api_url_entry.configure(state="normal")
        self.username_entry.configure(state="normal")
        self.password_entry.configure(state="normal")
        self.printer_ip_entry.configure(state="normal")
        self.printer_port_entry.configure(state="normal")
        self.save_btn.configure(state="normal")
    
    def on_closing(self):
        """Handle window close."""
        if self.agent:
            self.agent.stop()
        self.destroy()


def main():
    app = EatEasyPrinterApp()
    app.protocol("WM_DELETE_WINDOW", app.on_closing)
    app.mainloop()


if __name__ == "__main__":
    main()
