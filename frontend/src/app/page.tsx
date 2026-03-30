"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ChefHat,
  ChevronDown,
  CircleAlert,
  CircleCheckBig,
  ClipboardList,
  Clock3,
  CookingPot,
  Egg,
  FilePenLine,
  HandPlatter,
  LoaderCircle,
  Mic,
  Minus,
  Package,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  WandSparkles,
  X,
} from "lucide-react";
import { API_URL } from "../config";
import { checkAuth, getAuthHeaders } from "../auth";

// Types
interface MenuItem {
  id: number;
  name: string;
  base_price: number;
  category: string;
}

interface AddOnOption {
  name: string;
  price: number;
  emoji: string;
}

interface AddOn {
  name: string;
  price: number;
  selected: boolean;
}

interface OrderItem {
  menu_name: string;
  quantity: number;
  note: string | null;
  price: number | null;
  add_ons: AddOn[];
  dineOption?: "dine-in" | "takeaway";
}

interface OrderResponse {
  success: boolean;
  transcript?: string;
  items: OrderItem[];
  total_price: number;
  raw_gemini_response?: string;
  error?: string;
  suggestions?: string[];
}

type AppState = "idle" | "recording" | "processing" | "review" | "confirmed" | "error";

const ADDON_ICON_MAP: Record<string, LucideIcon> = {
  ไข่ดาว: Egg,
  ไข่เจียว: Egg,
  พิเศษ: Sparkles,
  กับข้าว: CookingPot,
  เพิ่มข้าว: HandPlatter,
};

const DINE_OPTION_UI = {
  "dine-in": {
    label: "ทานที่ร้าน",
    icon: UtensilsCrossed,
    className: "bg-sky-400/12 text-sky-200",
  },
  takeaway: {
    label: "กลับบ้าน",
    icon: Package,
    className: "bg-[rgba(243,162,79,0.18)] text-[var(--accent)]",
  },
} as const;

// Backend URL: Use relative "/api" path to leverage Next.js Rewrites (Proxies to 8000)
// This solves Mixed Content (HTTPS->HTTP) and CORS/Network issues on mobile
const BACKEND_URL = API_URL;

export default function VoiceOrderPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [appState, setAppState] = useState<AppState>("idle");
  const [orderData, setOrderData] = useState<OrderResponse | null>(null);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [confirmationMessage, setConfirmationMessage] = useState<string>("");
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [noteMode, setNoteMode] = useState<number>(-1);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showValidationModal, setShowValidationModal] = useState<boolean>(false);
  const [showOrderTypeModal, setShowOrderTypeModal] = useState<boolean>(false);
  const [expandedIndex, setExpandedIndex] = useState<number>(-1);

  // Manual Add State
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [addonOptions, setAddonOptions] = useState<AddOnOption[]>([]);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualSearch, setManualSearch] = useState("");
  const [selectedManualItem, setSelectedManualItem] = useState<MenuItem | null>(null);
  const [manualAddons, setManualAddons] = useState<string[]>([]);
  const [manualQuantity, setManualQuantity] = useState(1);

  // Check authentication on mount
  useEffect(() => {
    const verifyAuth = async () => {
      const authenticated = await checkAuth();
      if (!authenticated) {
        router.push("/login");
      } else {
        setIsAuthenticated(true);
      }
      setAuthLoading(false);
    };
    verifyAuth();
  }, [router]);

  // Fetch Menu Data (only when authenticated)
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchData = async () => {
      try {
        const menuRes = await fetch(`${BACKEND_URL}/menu-items`, {
          headers: getAuthHeaders(),
        });
        const menuData = await menuRes.json();
        if (menuData.success) setMenuItems(menuData.items);

        const addonRes = await fetch(`${BACKEND_URL}/addons`, {
          headers: getAuthHeaders(),
        });
        const addonData = await addonRes.json();
        if (addonData.addons) setAddonOptions(addonData.addons);
      } catch (e) {
        console.error("Failed to load menu data", e);
      }
    };
    fetchData();
  }, [isAuthenticated]);


  const openManualModal = () => {
    setShowManualModal(true);
    setManualSearch("");
    setSelectedManualItem(null);
    setManualAddons([]);
    setManualQuantity(1);
  };

  const handleManualAdd = () => {
    if (!selectedManualItem) return;

    // Convert string array to AddOn objects
    const selectedAddonObjs: AddOn[] = addonOptions
      .filter(opt => manualAddons.includes(opt.name))
      .map(opt => ({ name: opt.name, price: opt.price, selected: true }));

    // Calculate total
    const total = (selectedManualItem.base_price + selectedAddonObjs.reduce((s, a) => s + a.price, 0)) * manualQuantity;

    const newItem: OrderItem = {
      menu_name: selectedManualItem.name,
      quantity: manualQuantity,
      note: null,
      price: total / manualQuantity, // Price per unit logic in existing code is slightly ambiguous, but cart expects 'price' to be unit price with addons? 
      // Checking updateCartItem logic: basePrice = item.price ... wait.
      // Existing logic: updateCartItem recalculates price based on unit price. 
      // Let's look at `updateCartItem`:
      // const basePrice = (item.price || 0) - active_addons_price...
      // So item.price in cart IS unit price INCLUDING addons.
      add_ons: selectedAddonObjs
    };

    // Calculate unit price correctly
    newItem.price = selectedManualItem.base_price + selectedAddonObjs.reduce((s, a) => s + a.price, 0);

    setCart(prev => [...prev, newItem]);

    // Close and reset
    setShowManualModal(false);

    // Auto scroll
    setTimeout(() => {
      setExpandedIndex(cart.length); // Expand the new one (will be at index length)
      const el = document.getElementById(`cart-item-${cart.length}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // Audio recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null); // Timer for silence detection
  const noteModeRef = useRef<number>(-1); // Ref to track note mode in callbacks
  const isProcessingRef = useRef(false); // Lock for stopRecording to prevent double calls
  const hasAutoStoppedRef = useRef(false); // Prevent double auto-stop from Speech API events

  // Sync noteMode state to ref
  useEffect(() => {
    noteModeRef.current = noteMode;
  }, [noteMode]);
  const transcriptRef = useRef<string>(""); // Store latest transcript for callback

  // Format recording time
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Menu keywords for auto-detection (Removed generic meats to avoid false triggers)
  const MENU_KEYWORDS = [
    "กระเพรา", "กะเพรา", "แกงเขียวหวาน", "แกงเผ็ด", "มัสมั่น", "พะแนง",
    "กระเทียม", "คะน้า", "ผัดผักบุ้ง", "ผัดซีอิ๊ว", "ข้าวผัด", "สุกี้",
    "ไข่เจียว", "ไข่ดาว", "หมูทอด", "หมูกรอบ", "มันไก่", "ขาหมู", "หมูแดง", "คากิ",
    "ราดหน้า", "ต้มยำ", "แกงจืด", "ต้มจืด", "พริกเผา"
  ];

  // Check if transcript contains menu item
  const detectMenuItem = (text: string): boolean => {
    return MENU_KEYWORDS.some(keyword => text.includes(keyword));
  };

  // Process transcript with backend (text-based, no audio upload)
  const isProcessingTranscriptRef = useRef(false); // Lock to prevent concurrent transcript processing

  const processTranscript = async () => {
    // === CRITICAL: Prevent double processing ===
    // If already processing, DO NOT process again
    if (isProcessingTranscriptRef.current) {
      console.log("[DEBUG] processTranscript blocked - already processing");
      return;
    }
    isProcessingTranscriptRef.current = true;
    console.log("[DEBUG] processTranscript started");

    try {
      // Use the transcript from ref (state might not be updated yet due to React closure)
      const transcript = transcriptRef.current.trim();

      // Clear transcript ref immediately to prevent double processing if called twice
      transcriptRef.current = "";

      if (!transcript) {
        console.log("[DEBUG] Empty transcript, showing error");
        setErrorMessage("ไม่ได้ยินเสียง กรุณาลองพูดอีกครั้ง");
        setSuggestions([]); // Clear suggestions if empty
        setAppState("error");
        setNoteMode(-1); // Exit note mode on error
        return;
      }

      // If in note mode, save as note instead of processing as order
      // Check both state and ref to be safe (Ref is more reliable in closures)
      const currentNoteIndex = noteModeRef.current >= 0 ? noteModeRef.current : noteMode;

      if (currentNoteIndex >= 0) {
        setCart(prevCart => {
          const newCart = [...prevCart];
          if (newCart[currentNoteIndex]) {
            newCart[currentNoteIndex] = { ...newCart[currentNoteIndex], note: transcript };
          }
          return newCart;
        });
        setNoteMode(-1); // Exit note mode
        setAppState("idle");
        setLiveTranscript("");
        return;
      }

      const response = await fetch(`${BACKEND_URL}/process-text-order`, {
        method: "POST",
        headers: getAuthHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ transcript }),
      });

      const data: OrderResponse = await response.json();
      console.log("[DEBUG] Backend response:", data.success, data.items?.length);

      if (data.success && data.items.length > 0) {
        // ADD to cart instead of replacing
        const newItem = data.items[0];
        console.log("[DEBUG] Adding to cart:", newItem.menu_name);
        setCart(prevCart => {
          const newCart = [...prevCart, newItem];
          // Auto-expand the new item (last index)
          setExpandedIndex(newCart.length - 1);

          // Auto-scroll to the new item after DOM updates
          setTimeout(() => {
            const newItemElement = document.getElementById(`cart-item-${newCart.length - 1}`);
            if (newItemElement) {
              newItemElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 100);

          return newCart;
        });
        setOrderData(data);
        // STAY ON IDLE to allow continuous ordering (Cart is visible on right)
        setAppState("idle");
        setLiveTranscript(""); // Clear live transcript on success
      } else {
        setErrorMessage(data.error || "ไม่พบรายการอาหารในคำสั่ง กรุณาลองใหม่อีกครั้ง");
        setSuggestions(data.suggestions || []);
        setAppState("error");
      }
    } catch (error) {
      console.error("Error processing transcript:", error);
      setErrorMessage("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      setAppState("error");
      setNoteMode(-1); // Exit note mode on error
    } finally {
      // === ALWAYS reset lock after processing ===
      console.log("[DEBUG] processTranscript finished, resetting lock");
      isProcessingTranscriptRef.current = false;
    }
  };

  // Draw waveform visualization
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;

    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationIdRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      // Clear canvas
      ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw bars
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

        // Gradient colors
        const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, "#f97316");
        gradient.addColorStop(0.5, "#fb923c");
        gradient.addColorStop(1, "#fdba74");

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);

        x += barWidth;
      }
    };

    draw();
  }, []);

  // Stop recording (Defined first to be used by others)
  const stopRecording = useCallback(async () => {
    if (isProcessingRef.current) return; // Prevent double calls
    isProcessingRef.current = true;

    setAppState("processing");

    try {
      // Stop Speech Recognition
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      // Stop Timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      // Clear Silence Timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      // Process immediately
      await processTranscript();
    } finally {
      isProcessingRef.current = false;
    }
  }, [processTranscript]);

  // Start live transcript using Web Speech API
  const startLiveTranscript = useCallback(() => {
    // Check if browser supports Web Speech API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      console.log("Web Speech API not supported, live transcript disabled");
      setLiveTranscript("(Live preview ไม่รองรับในเบราว์เซอร์นี้)");
      return;
    }

    // Detect Android - Chrome Android doesn't support continuous mode properly
    const isAndroid = /Android/i.test(navigator.userAgent);
    console.log("[Speech] Platform detected:", isAndroid ? "Android" : "Desktop/iOS");

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = "th-TH";
      // Android: use single-shot mode with auto-restart (continuous doesn't work)
      // Desktop/iOS Safari: use continuous mode
      recognition.continuous = !isAndroid;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      // For Android: accumulate transcripts across restarts
      let accumulatedTranscript = "";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // For Android: accumulate final transcripts across restarts
        if (isAndroid && finalTranscript) {
          accumulatedTranscript += (accumulatedTranscript ? " " : "") + finalTranscript;
        }

        const fullTranscript = isAndroid
          ? (accumulatedTranscript + (interimTranscript ? " " + interimTranscript : "")).trim()
          : (finalTranscript + interimTranscript);

        setLiveTranscript(fullTranscript);
        transcriptRef.current = fullTranscript;

        // Auto-detect: if we have a final result with a menu item, stop and process
        // ONLY in Order Mode (in Note Mode, we rely on silence detection)
        // Use hasAutoStoppedRef to prevent multiple calls from rapid Speech API events
        const transcriptToCheck = isAndroid ? accumulatedTranscript : finalTranscript;
        if (noteModeRef.current < 0 && transcriptToCheck && detectMenuItem(transcriptToCheck) && !hasAutoStoppedRef.current) {
          hasAutoStoppedRef.current = true; // Lock immediately to prevent double calls
          console.log("Menu detected, auto-stopping:", transcriptToCheck);
          // Clear silence timer before stopping to prevent race condition
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          stopRecording(); // Use the unified stop function
          return; // EXIT HERE to prevent setting new silence timer
        }

        // Silence Detection (Auto-stop after 1.0s of silence for ALL modes)
        // Also check hasAutoStoppedRef to prevent double-trigger with menu detection
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        if (fullTranscript.trim().length > 0 && !hasAutoStoppedRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            // Double-check the lock hasn't been set by menu detection while timer was waiting
            if (hasAutoStoppedRef.current) {
              console.log("[DEBUG] Silence timer blocked - already auto-stopped");
              return;
            }
            hasAutoStoppedRef.current = true; // Lock to prevent menu detection from firing after
            console.log("Silence detected, auto-stopping...");
            stopRecording();
          }, 1000);
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onerror = (event: any) => {
        console.log("Speech recognition error:", event.error);
        if (event.error === "no-speech") {
          setLiveTranscript("(ไม่ได้ยินเสียง - กรุณาพูดใกล้ไมค์)");
          // For Android: auto-restart on no-speech if still recording
          if (isAndroid && appState === "recording" && !hasAutoStoppedRef.current) {
            console.log("[Android] No speech detected, restarting...");
            try {
              recognition.start();
            } catch (e) {
              console.log("[Android] Could not restart after no-speech");
            }
          }
        } else if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setErrorMessage("⚠️ ไม่สามารถเข้าถึงไมโครโฟนได้ (Permission Denied)");
          setAppState("error");
        } else if (event.error === "aborted") {
          // Ignore aborted errors (happens when manually stopping)
          console.log("[Speech] Recognition aborted");
        }
      };

      recognition.onend = () => {
        // For Android: auto-restart if still in recording mode and not manually stopped
        if (isAndroid && appState === "recording" && !hasAutoStoppedRef.current) {
          console.log("[Android] Recognition ended, restarting...");
          try {
            recognition.start();
          } catch (e) {
            console.log("[Android] Could not restart recognition:", e);
          }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (error) {
      console.log("Could not start speech recognition:", error);
      setLiveTranscript("(Live preview ไม่พร้อมใช้งาน)");
    }
  }, [detectMenuItem, stopRecording]);

  // Start recording with Web Speech API for live transcript
  const startRecording = useCallback(async () => {
    try {
      if (appState === "recording") return;

      setSuggestions([]); // Clear suggestions on start
      setErrorMessage(""); // Clear error on start

      // Security check for Microphone on non-localhost/non-https
      if (window.location.hostname !== "localhost" && window.location.protocol !== "https:") {
        setErrorMessage("⚠️ ไมค์ใช้ไม่ได้บน HTTP (ต้องใช้ HTTPS หรือ localhost)");
        setAppState("error");
        return;
      }

      setLiveTranscript("");
      setRecordingTime(0);
      hasAutoStoppedRef.current = false; // Reset auto-stop lock for new recording session

      // Start recording timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      // Start Web Speech API only (No MediaRecorder/getUserMedia to avoid conflicts)
      startLiveTranscript();

      setAppState("recording");
    } catch (error) {
      console.error("Error starting recording:", error);
      setErrorMessage("เกิดข้อผิดพลาดในการเริ่มอัดเสียง");
      setAppState("error");
    }
  }, [appState, startLiveTranscript]);

  // Toggle recording (click to start/stop)
  const toggleRecording = useCallback(async () => {
    if (appState === "recording") {
      // Stop recording
      await stopRecording();
    } else {
      // Start recording (works from idle, review, or even error state)
      await startRecording();
    }
  }, [appState, startRecording, stopRecording]);

  // Delete item from cart
  const deleteFromCart = (index: number) => {
    setCart(prevCart => prevCart.filter((_, i) => i !== index));
  };

  // Update item in cart
  const updateCartItem = (index: number, updatedItem: OrderItem) => {
    setCart(prevCart => {
      const newCart = [...prevCart];
      newCart[index] = updatedItem;
      return newCart;
    });
  };

  // Calculate cart total
  const getCartTotal = () => {
    return cart.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
  };

  // Lock mechanism for double submit prevention
  const isSubmittingRef = useRef(false);

  // Confirm order (Step 1: Open Modal)
  const confirmOrder = async () => {
    // Check both React state AND the Ref lock
    if (cart.length === 0 || appState === "processing" || isSubmittingRef.current) return;

    // Show Modal to ask for Dine-in or Takeaway
    setShowOrderTypeModal(true);
  };

  // Final Order Submission (called from Modal)
  const submitOrder = async (dineOption: "dine-in" | "takeaway") => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setShowOrderTypeModal(false); // Close modal
    setAppState("processing");

    try {
      // Prepare items: append "ใส่กล่องกลับบ้าน" to note for ALL items if takeaway
      const itemsToSend = cart.map(item => {
        if (dineOption === "takeaway") {
          const existingNote = item.note ? item.note.trim() : "";
          const takeawayNote = "ใส่กล่องกลับบ้าน";
          const newNote = existingNote ? `${existingNote}, ${takeawayNote}` : takeawayNote;
          return { ...item, note: newNote, dineOption: "takeaway" };
        }
        return { ...item, dineOption: "dine-in" };
      });

      const response = await fetch(`${BACKEND_URL}/confirm-order`, {
        method: "POST",
        headers: getAuthHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          items: itemsToSend,
          total_price: getCartTotal(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setConfirmationMessage(data.message);
        setAppState("confirmed");

        // Reset after 3 seconds
        setTimeout(() => {
          resetToIdle();
          isSubmittingRef.current = false; // Unlock only after reset
        }, 3000);
      } else {
        setErrorMessage(data.message || "เกิดข้อผิดพลาดในการบันทึกออเดอร์");
        setAppState("error");
        isSubmittingRef.current = false; // Unlock on error
      }
    } catch (error) {
      console.error("Error confirming order:", error);
      setErrorMessage("ไม่สามารถบันทึกออเดอร์ได้");
      setAppState("error");
      isSubmittingRef.current = false; // Unlock on error
    }
  };

  // Reset to idle state
  const resetToIdle = () => {
    setAppState("idle");
    setOrderData(null);
    setCart([]);
    setErrorMessage("");
    setConfirmationMessage("");
    setLiveTranscript("");
    setRecordingTime(0);
    setSuggestions([]);
    transcriptRef.current = "";
  };

  const handleSuggestionClick = async (text: string) => {
    setAppState("processing");
    setSuggestions([]);
    setErrorMessage("");

    try {
      const response = await fetch(`${BACKEND_URL}/process-text-order`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ transcript: text }),
      });
      const data = await response.json();

      if (data.success && data.items.length > 0) {
        const newItem = data.items[0];
        setCart(prev => [...prev, newItem]);
        setAppState("idle");
      } else {
        setErrorMessage(data.error || "ไม่พบรายการ");
        setSuggestions(data.suggestions || []);
        setAppState("error");
      }
    } catch (err) {
      setErrorMessage("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      setAppState("error");
    }
  };



  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const pendingNoteItem = noteMode >= 0 ? cart[noteMode] : null;
  const filteredManualItems = menuItems.filter(item => item.name.includes(manualSearch));
  const selectedManualTotal = selectedManualItem
    ? (selectedManualItem.base_price + addonOptions.filter(o => manualAddons.includes(o.name)).reduce((sum, addon) => sum + addon.price, 0)) * manualQuantity
    : 0;

  // Show loading while checking auth
  if (authLoading) {
    return (
      <main className="page-frame flex min-h-screen items-center justify-center px-4 py-8">
        <div className="panel-surface flex w-full max-w-md items-center justify-center gap-3 rounded-[2rem] px-6 py-8 text-[var(--muted)]">
          <LoaderCircle className="h-5 w-5 animate-spin text-[var(--accent)]" />
          กำลังตรวจสอบสิทธิ์...
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <main className="page-frame min-h-screen px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1700px] gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)]">
          <section className="panel-surface flex min-h-[calc(100vh-2.5rem)] flex-col rounded-[2rem] p-5 sm:p-7 lg:p-8">
            <header className="mb-6 flex flex-col gap-5 border-b border-white/8 pb-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--muted)]">
                  <ChefHat className="h-4 w-4 text-[var(--accent)]" />
                  ระบบสั่งอาหารด้วยเสียง
                </div>
                <div>
                  <p className="section-kicker mb-3">Voice Ordering</p>
                  <h1 className="display-font text-3xl text-white sm:text-4xl lg:text-5xl">
                    รับออเดอร์แบบเร็วขึ้น แต่ภาพลักษณ์ยังต้องดูเป็นร้านจริง
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                    ใช้เสียงเพื่อเพิ่มเมนูเข้าตะกร้า แล้วตรวจรายการ แก้ add-on และยืนยันออเดอร์ได้จากหน้าจอเดียว
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:w-[22rem]">
                <div className="panel-surface-soft rounded-[1.5rem] p-4">
                  <p className="mb-2 text-sm text-[var(--muted)]">สถานะระบบ</p>
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${appState === "error" ? "bg-rose-400/14 text-rose-200" :
                      appState === "confirmed" ? "bg-emerald-400/14 text-emerald-100" :
                        appState === "processing" ? "bg-sky-400/14 text-sky-100" :
                          appState === "recording" ? "bg-orange-400/16 text-[var(--accent)]" :
                            "bg-white/6 text-white"
                      }`}>
                      {appState === "error" ? (
                        <CircleAlert className="h-5 w-5" />
                      ) : appState === "confirmed" ? (
                        <CircleCheckBig className="h-5 w-5" />
                      ) : appState === "processing" ? (
                        <LoaderCircle className="h-5 w-5 animate-spin" />
                      ) : (
                        <Mic className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {appState === "idle" && noteMode < 0 && "พร้อมรับออเดอร์"}
                        {appState === "idle" && noteMode >= 0 && "โหมดเพิ่มรายละเอียด"}
                        {appState === "recording" && (noteMode >= 0 ? "กำลังบันทึกรายละเอียด" : "กำลังฟังคำสั่ง")}
                        {appState === "processing" && "กำลังประมวลผล"}
                        {appState === "error" && "มีข้อผิดพลาด"}
                        {appState === "confirmed" && "บันทึกสำเร็จ"}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {appState === "recording" ? formatTime(recordingTime) : `${cart.length} รายการในตะกร้า`}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={openManualModal}
                  className="panel-surface-soft flex rounded-[1.5rem] p-4 text-left transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/6 text-[var(--accent)]">
                      <WandSparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">เพิ่มรายการเอง</p>
                      <p className="text-xs text-[var(--muted)]">ค้นหาเมนูแล้วปรับ add-on แบบ manual</p>
                    </div>
                  </div>
                </button>
              </div>
            </header>

            <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="flex flex-col gap-4">
                <div className="panel-surface-soft rounded-[1.75rem] p-5 sm:p-6">
                  <p className="section-kicker mb-3">Now Listening</p>
                  {appState === "idle" && noteMode < 0 && (
                    <>
                      <h2 className="text-2xl font-semibold text-white sm:text-3xl">แตะปุ่มกลางแล้วเริ่มพูดรายการอาหาร</h2>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                        ตัวอย่างเช่น “ข้าวกะเพราหมูไข่ดาว” หรือ “ข้าวผัดกุ้งพิเศษ”
                      </p>
                    </>
                  )}
                  {appState === "idle" && noteMode >= 0 && (
                    <>
                      <h2 className="text-2xl font-semibold text-white sm:text-3xl">เพิ่มรายละเอียดให้ {pendingNoteItem?.menu_name}</h2>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                        พูดข้อความกำกับอาหารได้เลย เช่น ไม่เผ็ด ใส่กล่อง หรือเลือกเส้น
                      </p>
                    </>
                  )}
                  {appState === "recording" && (
                    <>
                      <h2 className="text-2xl font-semibold text-white sm:text-3xl">
                        {noteMode >= 0 ? "กำลังฟังรายละเอียดเพิ่มเติม" : "กำลังฟังคำสั่งอาหาร"}
                      </h2>
                      <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-rose-400/12 px-3 py-1 text-sm text-rose-100">
                        <Clock3 className="h-4 w-4" />
                        {formatTime(recordingTime)}
                      </div>
                    </>
                  )}
                  {appState === "processing" && (
                    <>
                      <h2 className="text-2xl font-semibold text-white sm:text-3xl">กำลังประมวลผลคำสั่ง</h2>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                        ระบบกำลังเทียบ transcript กับเมนูและตัวเลือกเพิ่มเติม
                      </p>
                    </>
                  )}
                  {appState === "error" && (
                    <>
                      <h2 className="text-2xl font-semibold text-white sm:text-3xl">ระบบยังไม่เข้าใจคำสั่งนี้</h2>
                      <p className="mt-2 rounded-2xl border border-rose-400/16 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                        {errorMessage}
                      </p>
                    </>
                  )}
                  {appState === "confirmed" && (
                    <>
                      <h2 className="text-2xl font-semibold text-white sm:text-3xl">บันทึกออเดอร์สำเร็จ</h2>
                      <p className="mt-2 text-sm leading-6 text-emerald-100">
                        {confirmationMessage}
                      </p>
                    </>
                  )}
                </div>

                <div className="panel-surface-soft flex flex-1 flex-col items-center justify-center rounded-[2rem] px-6 py-8 text-center">
                  <button
                    onClick={() => {
                      if (appState === "idle" || appState === "error") toggleRecording();
                      else if (appState === "recording") toggleRecording();
                    }}
                    disabled={appState === "processing" || appState === "confirmed"}
                    className={`
                      group relative flex h-56 w-56 items-center justify-center rounded-full transition-all duration-500 sm:h-72 sm:w-72
                      ${appState === "idle" || appState === "review" || appState === "error"
                        ? "border border-[rgba(243,162,79,0.22)] bg-gradient-to-br from-amber-200/10 via-orange-400/8 to-rose-500/10 hover:-translate-y-1 ring-accent"
                        : ""}
                      ${appState === "recording"
                        ? noteMode >= 0
                          ? "border border-orange-300/30 bg-orange-400/12 scale-105 shadow-[0_0_0_1px_rgba(243,162,79,0.26),0_0_60px_rgba(243,162,79,0.18)]"
                          : "border border-rose-300/30 bg-rose-400/12 scale-105 shadow-[0_0_0_1px_rgba(247,127,104,0.26),0_0_60px_rgba(247,127,104,0.18)]"
                        : ""}
                      ${appState === "processing" ? "cursor-not-allowed border border-sky-300/20 bg-sky-300/10 opacity-80" : ""}
                      ${appState === "confirmed" ? "border border-emerald-300/20 bg-emerald-300/12" : ""}
                    `}
                  >
                    <div className="absolute inset-5 rounded-full border border-white/8" />
                    <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_58%)]" />

                    <div className="relative z-10 flex flex-col items-center gap-3">
                      {(appState === "idle" || appState === "review" || appState === "error") && (
                        <>
                          <Mic className={`h-16 w-16 sm:h-24 sm:w-24 ${noteMode >= 0 ? "text-[var(--accent)]" : "text-white"}`} />
                          <div>
                            <p className="text-2xl font-semibold text-white sm:text-3xl">
                              {noteMode >= 0 ? "พูดรายละเอียด" : cart.length > 0 ? "สั่งเพิ่ม" : "เริ่มสั่ง"}
                            </p>
                            <p className="mt-1 text-sm text-[var(--muted)]">
                              แตะอีกครั้งเพื่อหยุดฟัง
                            </p>
                          </div>
                        </>
                      )}
                      {appState === "recording" && (
                        <>
                          <Mic className={`h-16 w-16 sm:h-24 sm:w-24 ${noteMode >= 0 ? "text-[var(--accent)]" : "text-rose-200"}`} />
                          <div className="inline-flex items-center gap-2 rounded-full bg-black/20 px-4 py-2 text-sm text-white/90">
                            <Clock3 className="h-4 w-4" />
                            {formatTime(recordingTime)}
                          </div>
                        </>
                      )}
                      {appState === "processing" && (
                        <>
                          <LoaderCircle className="h-16 w-16 animate-spin text-sky-100 sm:h-24 sm:w-24" />
                          <p className="text-lg font-semibold text-white sm:text-2xl">กำลังประมวลผล</p>
                        </>
                      )}
                      {appState === "confirmed" && (
                        <>
                          <CircleCheckBig className="h-16 w-16 text-emerald-100 sm:h-24 sm:w-24" />
                          <p className="text-lg font-semibold text-white sm:text-2xl">ออเดอร์ถูกบันทึกแล้ว</p>
                        </>
                      )}
                    </div>
                  </button>

                  {appState === "recording" && (
                    <div className="mt-8 flex h-16 items-end justify-center gap-2">
                      {[36, 68, 52, 84, 46, 76].map((height, index) => (
                        <div
                          key={height}
                          className={`w-2 rounded-full ${noteMode >= 0 ? "bg-[var(--accent)]" : "bg-rose-300"} animate-pulse`}
                          style={{
                            height: `${height}%`,
                            animationDuration: `${0.7 + index * 0.1}s`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="panel-surface-soft rounded-[1.75rem] p-5">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/6 text-[var(--accent)]">
                      <Mic className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Transcript สด</p>
                      <p className="text-xs text-[var(--muted)]">ข้อความที่ระบบได้ยินจากรอบล่าสุด</p>
                    </div>
                  </div>
                  {liveTranscript ? (
                    <div className="custom-scrollbar max-h-36 overflow-y-auto rounded-[1.25rem] border border-white/8 bg-black/10 px-4 py-3">
                      <p className="text-base leading-7 text-white sm:text-lg">"{liveTranscript}"</p>
                    </div>
                  ) : (
                    <div className="rounded-[1.25rem] border border-dashed border-white/8 px-4 py-6 text-sm text-[var(--muted)]">
                      เมื่อเริ่มพูด ระบบจะแสดง transcript ในพื้นที่นี้ทันที
                    </div>
                  )}

                  {appState === "error" && suggestions.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-2 text-sm text-[var(--muted)]">ลองเลือกตัวเลือกที่ใกล้เคียง</p>
                      <div className="flex flex-wrap gap-2">
                        {suggestions.map((suggestion, index) => (
                          <button
                            key={index}
                            onClick={() => handleSuggestionClick(suggestion)}
                            className="rounded-full border border-[rgba(243,162,79,0.22)] bg-[rgba(243,162,79,0.08)] px-3 py-2 text-sm text-[var(--accent)] transition-colors hover:bg-[rgba(243,162,79,0.16)]"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {appState === "error" && (
                    <button
                      onClick={() => {
                        setErrorMessage("");
                        setAppState("idle");
                      }}
                      className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10"
                    >
                      <CircleAlert className="h-4 w-4 text-[var(--accent)]" />
                      ลองใหม่
                    </button>
                  )}
                </div>

                {pendingNoteItem && (
                  <div className="panel-surface-soft rounded-[1.75rem] p-5">
                    <div className="mb-2 flex items-center gap-3">
                      <FilePenLine className="h-5 w-5 text-[var(--accent)]" />
                      <p className="font-semibold text-white">กำลังเพิ่มรายละเอียด</p>
                    </div>
                    <p className="text-sm leading-6 text-[var(--muted)]">
                      รายการที่เลือก: <span className="font-semibold text-white">{pendingNoteItem.menu_name}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="panel-surface flex min-h-[calc(100vh-2.5rem)] flex-col rounded-[2rem]">
            <div className="border-b border-white/8 px-5 py-5 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/6 text-[var(--accent)]">
                      <ClipboardList className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="section-kicker mb-1">Order Board</p>
                      <h2 className="text-2xl font-bold text-white">รายการอาหาร</h2>
                    </div>
                  </div>
                  <p className="text-sm text-[var(--muted)]">ปรับจำนวน เพิ่ม add-on และใส่รายละเอียดก่อนยืนยัน</p>
                </div>

                <div className="rounded-full border border-[rgba(243,162,79,0.22)] bg-[rgba(243,162,79,0.08)] px-4 py-2 text-sm font-semibold text-[var(--accent)]">
                  {cart.length} รายการ
                </div>
              </div>
            </div>

            <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {cart.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center rounded-[1.8rem] border border-dashed border-white/10 px-6 py-16 text-center">
                  <ClipboardList className="mb-5 h-16 w-16 text-[var(--muted)]" />
                  <h3 className="text-2xl font-bold text-white">ยังไม่มีรายการในตะกร้า</h3>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--muted)]">
                    เริ่มจากกดปุ่มไมโครโฟนเพื่อสั่งอาหาร หรือเพิ่มรายการเองแบบ manual
                  </p>
                  <button
                    onClick={openManualModal}
                    className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-white/8 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                  >
                    <Plus className="h-4 w-4 text-[var(--accent)]" />
                    เพิ่มรายการเอง
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map((item, index) => {
                    const dineOptionConfig = item.dineOption ? DINE_OPTION_UI[item.dineOption] : null;
                    const DineOptionIcon = dineOptionConfig?.icon;
                    return (
                      <div
                        key={index}
                        id={`cart-item-${index}`}
                        className={`panel-surface-soft animate-slide-in overflow-hidden rounded-[1.75rem] ${expandedIndex === index ? "ring-accent" : ""}`}
                      >
                        <div
                          onClick={() => setExpandedIndex(expandedIndex === index ? -1 : index)}
                          className="accordion-header flex cursor-pointer items-center justify-between gap-4 px-4 py-4 sm:px-5"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/6 text-sm font-bold text-white">
                              {index + 1}
                            </div>
                            <div className="min-w-0">
                              <h3 className="truncate text-lg font-semibold text-white sm:text-xl">{item.menu_name}</h3>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                                <span className="font-semibold text-[var(--accent)]">{item.price}฿</span>
                                <span className="text-[var(--muted)]">× {item.quantity}</span>
                                {dineOptionConfig && (
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${dineOptionConfig.className}`}>
                                    {DineOptionIcon && <DineOptionIcon className="h-3.5 w-3.5" />}
                                    {dineOptionConfig.label}
                                  </span>
                                )}
                                {item.note && (
                                  <span className="inline-flex max-w-[16rem] items-center gap-1 truncate rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/80">
                                    <FilePenLine className="h-3.5 w-3.5 text-[var(--accent)]" />
                                    {item.note}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-2xl font-bold text-white">{(item.price || 0) * item.quantity}</p>
                              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">THB</p>
                            </div>
                            <ChevronDown className={`accordion-chevron h-5 w-5 text-[var(--muted)] ${expandedIndex === index ? "expanded" : ""}`} />
                          </div>
                        </div>

                        <div className={`accordion-content px-4 sm:px-5 ${expandedIndex === index ? "expanded pb-5" : "collapsed"}`}>
                          <div className="border-t border-white/6 pt-4">
                            <div className="flex flex-wrap items-end justify-between gap-4">
                              <div className="flex flex-1 flex-wrap gap-2">
                                {item.add_ons.map((addon, addonIndex) => {
                                  const AddonIcon = ADDON_ICON_MAP[addon.name] ?? Sparkles;
                                  return (
                                    <button
                                      key={addonIndex}
                                      onClick={() => {
                                        const newAddOns = [...item.add_ons];
                                        newAddOns[addonIndex] = { ...addon, selected: !addon.selected };
                                        const basePrice = (item.price || 0) - item.add_ons.filter(a => a.selected).reduce((sum, activeAddon) => sum + activeAddon.price, 0);
                                        const newPrice = basePrice + newAddOns.filter(a => a.selected).reduce((sum, activeAddon) => sum + activeAddon.price, 0);
                                        updateCartItem(index, { ...item, add_ons: newAddOns, price: newPrice });
                                      }}
                                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${addon.selected
                                        ? "border-emerald-400/18 bg-emerald-400/10 text-emerald-100"
                                        : "border-white/8 bg-white/5 text-[var(--muted)] hover:bg-white/10 hover:text-white"
                                        }`}
                                    >
                                      <AddonIcon className="h-4 w-4" />
                                      {addon.name}
                                    </button>
                                  );
                                })}
                              </div>

                              <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/5 p-1.5">
                                <button
                                  onClick={() => {
                                    if (item.quantity > 1) updateCartItem(index, { ...item, quantity: item.quantity - 1 });
                                    else deleteFromCart(index);
                                  }}
                                  className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                                <span className="w-10 text-center text-lg font-semibold text-white">{item.quantity}</span>
                                <button
                                  onClick={() => updateCartItem(index, { ...item, quantity: item.quantity + 1 })}
                                  className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            <div className="mt-4 border-t border-white/6 pt-4">
                              {item.note ? (
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(243,162,79,0.2)] bg-[rgba(243,162,79,0.08)] px-3 py-2 text-sm text-[var(--accent)]">
                                    <FilePenLine className="h-4 w-4" />
                                    {item.note}
                                  </div>
                                  <button
                                    onClick={() => { setNoteMode(index); }}
                                    className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10"
                                  >
                                    <FilePenLine className="h-4 w-4 text-[var(--accent)]" />
                                    แก้ไขรายละเอียด
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setNoteMode(index);
                                    setTimeout(() => startRecording(), 50);
                                  }}
                                  className="flex w-full items-center justify-center gap-3 rounded-[1.3rem] border border-dashed border-white/10 bg-white/4 px-4 py-4 text-left text-sm text-[var(--muted)] transition-colors hover:bg-white/8 hover:text-white sm:text-base"
                                >
                                  <Mic className="h-5 w-5 text-[var(--accent)]" />
                                  <span>
                                    <span className="font-semibold text-white">เพิ่มรายละเอียด</span>
                                    <span className="ml-2 text-[var(--muted)]">เช่น ไม่เผ็ด ใส่กล่อง หรือเลือกเส้น</span>
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    onClick={openManualModal}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[1.5rem] border border-dashed border-white/10 bg-white/4 px-4 py-4 text-sm font-semibold text-white transition-colors hover:bg-white/8"
                  >
                    <Plus className="h-4 w-4 text-[var(--accent)]" />
                    เพิ่มรายการอาหาร
                  </button>
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="glass glow-border-top border-t border-white/8 px-5 py-5 sm:px-6">
                <div className="mb-5 flex items-end justify-between">
                  <div>
                    <p className="section-kicker mb-2">Order Summary</p>
                    <p className="text-sm text-[var(--muted)]">ตรวจรายการก่อนส่งเข้าครัว</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">รวมทั้งหมด</p>
                    <p className="gradient-text-orange text-4xl font-bold">{getCartTotal()}</p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <button
                    onClick={() => { setCart([]); resetToIdle(); }}
                    className="col-span-1 inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-white/8 bg-white/5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                  >
                    <Trash2 className="h-4 w-4 text-[var(--accent)]" />
                    ล้าง
                  </button>
                  <button
                    onClick={confirmOrder}
                    disabled={appState === "processing"}
                    className="col-span-3 inline-flex h-14 items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[var(--accent)] via-orange-400 to-[var(--accent-strong)] text-lg font-bold text-stone-950 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CircleCheckBig className="h-5 w-5" />
                    ยืนยันรายการ
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {noteMode >= 0 && (
        <div
          className="fixed right-0 top-0 bottom-0 z-40 w-full bg-black/60 backdrop-blur-md xl:w-[43%]"
          onClick={() => setNoteMode(-1)}
        />
      )}

      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="panel-surface flex h-[84vh] w-full max-w-3xl animate-scale-in flex-col overflow-hidden rounded-[2rem]">
            <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
              <div>
                <p className="section-kicker mb-3">Manual Add</p>
                <h3 className="text-2xl font-bold text-white">
                  {selectedManualItem ? "ปรับแต่งรายการอาหาร" : "เลือกเมนูอาหาร"}
                </h3>
                {selectedManualItem && (
                  <button
                    onClick={() => setSelectedManualItem(null)}
                    className="mt-2 inline-flex items-center gap-2 text-sm text-[var(--muted)] transition-colors hover:text-white"
                  >
                    <ChevronDown className="h-4 w-4 rotate-90" />
                    ย้อนกลับไปเลือกเมนู
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowManualModal(false)}
                className="rounded-2xl border border-white/8 bg-white/5 p-2 text-[var(--muted)] transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-6">
              {!selectedManualItem ? (
                <div className="space-y-6">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                      type="text"
                      placeholder="ค้นหาเมนู..."
                      value={manualSearch}
                      onChange={(e) => setManualSearch(e.target.value)}
                      className="w-full rounded-[1.4rem] border border-white/8 bg-white/5 py-4 pl-12 pr-4 text-lg text-white placeholder:text-white/30 focus:border-[var(--accent)] focus:outline-none"
                      autoFocus
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredManualItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedManualItem(item)}
                        className="panel-surface-soft rounded-[1.4rem] p-4 text-left transition-transform hover:-translate-y-0.5"
                      >
                        <p className="mb-2 text-lg font-semibold text-white">{item.name}</p>
                        <p className="text-sm text-[var(--muted)]">{item.base_price} บาท</p>
                      </button>
                    ))}
                  </div>

                  {filteredManualItems.length === 0 && (
                    <div className="rounded-[1.4rem] border border-dashed border-white/10 px-4 py-10 text-center text-[var(--muted)]">
                      ไม่พบเมนูที่ค้นหา
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="section-kicker mb-3">Selected Menu</p>
                      <h2 className="text-3xl font-bold text-white">{selectedManualItem.name}</h2>
                    </div>
                    <div className="rounded-[1.4rem] border border-[rgba(243,162,79,0.22)] bg-[rgba(243,162,79,0.08)] px-5 py-4 text-right">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">ราคาเริ่มต้น</p>
                      <p className="text-2xl font-bold text-[var(--accent)]">{selectedManualItem.base_price}฿</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-[var(--muted)]">ตัวเลือกเพิ่มเติม</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {addonOptions.map((option) => {
                        const AddonIcon = ADDON_ICON_MAP[option.name] ?? Sparkles;
                        const isSelected = manualAddons.includes(option.name);
                        return (
                          <button
                            key={option.name}
                            onClick={() => {
                              setManualAddons((current) =>
                                current.includes(option.name)
                                  ? current.filter(name => name !== option.name)
                                  : [...current, option.name]
                              );
                            }}
                            className={`flex items-center justify-between rounded-[1.25rem] border px-4 py-4 transition-colors ${isSelected
                              ? "border-emerald-400/18 bg-emerald-400/10 text-emerald-100"
                              : "border-white/8 bg-white/5 text-white hover:bg-white/8"
                              }`}
                          >
                            <span className="flex items-center gap-3 font-semibold">
                              <AddonIcon className="h-5 w-5" />
                              {option.name}
                            </span>
                            <span className="text-sm">+{option.price}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-[var(--muted)]">จำนวน</h4>
                    <div className="inline-flex items-center gap-3 rounded-full border border-white/8 bg-white/5 p-2">
                      <button
                        onClick={() => manualQuantity > 1 && setManualQuantity((value) => value - 1)}
                        className="flex h-12 w-12 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-12 text-center text-3xl font-bold text-white">{manualQuantity}</span>
                      <button
                        onClick={() => setManualQuantity((value) => value + 1)}
                        className="flex h-12 w-12 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {selectedManualItem && (
              <div className="flex items-center justify-between gap-4 border-t border-white/8 px-6 py-5">
                <div>
                  <p className="text-sm text-[var(--muted)]">ราคารวม</p>
                  <p className="text-3xl font-bold text-[var(--accent)]">{selectedManualTotal}฿</p>
                </div>
                <button
                  onClick={handleManualAdd}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)] px-6 py-4 text-lg font-bold text-stone-950 transition-transform hover:-translate-y-0.5"
                >
                  <Plus className="h-5 w-5" />
                  เพิ่มรายการ
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showOrderTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="panel-surface w-full max-w-xl animate-scale-in rounded-[2rem] p-6 sm:p-8">
            <div className="text-center">
              <p className="section-kicker mb-3">Serving Type</p>
              <h3 className="display-font text-3xl text-white sm:text-4xl">เลือกรูปแบบการรับอาหาร</h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--muted)]">
                ค่านี้จะถูกแนบไปกับทุกรายการในออเดอร์เพื่อให้ครัวและบิลแสดงผลเหมือนเดิม
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <button
                  onClick={() => submitOrder("dine-in")}
                  className="group rounded-[1.75rem] border border-sky-300/20 bg-sky-300/8 px-5 py-8 text-left transition-transform hover:-translate-y-1"
                >
                  <UtensilsCrossed className="h-8 w-8 text-sky-200 transition-transform group-hover:scale-110" />
                  <p className="mt-6 text-2xl font-bold text-white">ทานที่ร้าน</p>
                  <p className="mt-2 text-sm leading-6 text-sky-50/70">ส่งเข้าครัวแบบเสิร์ฟที่โต๊ะหรือรับจากหน้าร้าน</p>
                </button>

                <button
                  onClick={() => submitOrder("takeaway")}
                  className="group rounded-[1.75rem] border border-[rgba(243,162,79,0.22)] bg-[rgba(243,162,79,0.08)] px-5 py-8 text-left transition-transform hover:-translate-y-1"
                >
                  <Package className="h-8 w-8 text-[var(--accent)] transition-transform group-hover:scale-110" />
                  <p className="mt-6 text-2xl font-bold text-white">กลับบ้าน</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">ระบบจะผูก note สำหรับแพ็กใส่กล่องเหมือน flow เดิม</p>
                </button>
              </div>

              <button
                onClick={() => setShowOrderTypeModal(false)}
                className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10"
              >
                <X className="h-4 w-4 text-[var(--accent)]" />
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
