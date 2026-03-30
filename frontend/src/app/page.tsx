"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
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

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-orange-500 text-xl animate-pulse">กำลังตรวจสอบสิทธิ์...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="h-[100dvh] w-full bg-[#0f172a] text-white flex flex-col landscape:flex-row overflow-hidden supports-[height:100svh]:h-[100svh]">

      {/* Left Column: Voice Interaction Area */}
      <section className="w-full landscape:w-1/2 h-1/2 landscape:h-full flex flex-col items-center justify-between p-4 md:p-8 relative border-b landscape:border-b-0 landscape:border-r border-gray-800/50 bg-gradient-to-b from-slate-900 to-slate-900/50 shrink-0">

        {/* 1. Header Branding (Flex item instead of absolute to prevent overlap) */}
        <div className="w-full text-center mt-2 landscape:mt-4 grow-0">
          <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-red-500">
            🍛 EASY Order
          </h1>
          <p className="text-gray-500 text-xs md:text-sm hidden landscape:block md:block">สั่งอาหารด้วยเสียงภาษาไทย</p>
        </div>

        {/* 2. Main Interaction Area (Centered) */}
        <div className="flex flex-col items-center justify-center gap-4 grow">
          {/* Status Text */}
          <div className="text-center h-12 flex flex-col justify-end">
            {appState === "idle" && noteMode < 0 && <p className="text-lg md:text-2xl text-gray-300 font-medium animate-fade-in">กดปุ่มแล้วพูด</p>}
            {appState === "idle" && noteMode >= 0 && (
              <div className="animate-fade-in">
                <p className="text-sm text-gray-500">{cart[noteMode]?.menu_name}</p>
                <p className="text-lg md:text-2xl text-orange-400 font-bold">🎤 พูดรายละเอียด</p>
              </div>
            )}
            {appState === "recording" && noteMode < 0 && <p className="text-xl md:text-3xl text-red-500 font-bold animate-pulse">กำลังฟัง... {formatTime(recordingTime)}</p>}
            {appState === "recording" && noteMode >= 0 && <p className="text-xl md:text-3xl text-orange-500 font-bold animate-pulse">พูดรายละเอียด... {formatTime(recordingTime)}</p>}
            {appState === "processing" && <p className="text-xl md:text-2xl text-blue-400 font-bold animate-pulse">กำลังประมวลผล...</p>}
            {appState === "error" && (
              <div className="flex flex-col items-center w-full max-w-md mx-auto z-50">
                <p className="text-sm md:text-lg text-red-400 font-bold bg-red-500/10 px-4 py-2 rounded-xl mb-3 border border-red-500/20">{errorMessage}</p>
                {suggestions.length > 0 && (
                  <div className="animate-fade-in w-full">
                    <p className="text-xs text-gray-500 mb-2">คุณหมายถึงรายการเหล่านี้หรือไม่?</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => handleSuggestionClick(s)}
                          className="px-4 py-2 bg-slate-800 hover:bg-orange-500 hover:text-white rounded-lg text-sm md:text-base text-orange-400 border border-slate-700 hover:border-orange-500 transition-all shadow-lg active:scale-95"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {appState === "confirmed" && <p className="text-xl md:text-2xl text-green-500 font-bold">{confirmationMessage}</p>}
          </div>

          {/* Main Microphone Button */}
          <button
            onClick={() => {
              if (appState === "idle" || appState === "error") toggleRecording();
              else if (appState === "recording") toggleRecording();
            }}
            disabled={appState === "processing" || appState === "confirmed"}
            className={`
              relative
              w-40 h-40
              landscape:w-32 landscape:h-32
              md:w-64 md:h-64
              lg:w-72 lg:h-72
              rounded-full flex flex-col items-center justify-center transition-all duration-500
              ${appState === "idle" || appState === "review" || appState === "error" ? (noteMode >= 0 ? "bg-orange-500/10 border-4 border-orange-500 hover:scale-105 glow-pulse-orange" : "bg-slate-800/80 hover:bg-slate-700 border-4 border-orange-500/50 hover:border-orange-500 hover:scale-105 glow-pulse-orange animate-float") : ""}
              ${appState === "recording" ? (noteMode >= 0 ? "bg-orange-500/20 scale-110 border-4 border-orange-500 glow-recording" : "bg-red-500/10 scale-110 border-4 border-red-500 glow-recording") : ""}
              ${appState === "processing" ? "bg-slate-800 border-4 border-blue-500 opacity-80 cursor-not-allowed" : ""}
              ${appState === "confirmed" ? "bg-green-500 text-white border-4 border-green-400 scale-100 glow-green" : ""}
            `}
          >
            <div className="relative z-10 flex flex-col items-center">
              {(appState === "idle" || appState === "review" || appState === "error") && (
                <>
                  <svg className={`w-16 h-16 landscape:w-12 landscape:h-12 md:w-24 md:h-24 ${noteMode >= 0 ? "text-orange-400" : "text-orange-500"} mb-2`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  <span className="text-lg landscape:text-base md:text-2xl font-bold text-white">{noteMode >= 0 ? "พูดเลย" : (cart.length > 0 ? "สั่งเพิ่ม" : "เริ่มสั่ง")}</span>
                </>
              )}
              {appState === "recording" && (
                <svg className={`w-16 h-16 md:w-24 md:h-24 ${noteMode >= 0 ? "text-orange-500" : "text-red-500"}`} fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" /></svg>
              )}
              {appState === "processing" && (
                <svg className="w-12 h-12 md:w-20 md:h-20 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
              )}
              {appState === "confirmed" && (
                <svg className="w-20 h-20 md:w-32 md:h-32 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              )}
            </div>
          </button>
        </div>

        {/* 3. Footer / Live Text / Waveform (Compact) */}
        <div className="w-full max-w-lg px-4 text-center grow-0 mb-2 landscape:mb-4 min-h-[3rem] flex flex-col justify-end items-center">
          {appState === "recording" && (
            <div className="w-full h-12 md:h-16 flex items-center justify-center gap-1 mb-2">
              {/* Fake Waveform Animation (Deterministic) */}
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-2 md:w-3 bg-red-500 rounded-full animate-pulse"
                  style={{
                    height: `${40 + (i % 3) * 20}%`,
                    animationDuration: `${0.6 + (i * 0.1)}s`
                  }}
                />
              ))}
            </div>
          )}

          {liveTranscript && (
            <div className="bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700 backdrop-blur-md max-h-20 overflow-y-auto custom-scrollbar w-full">
              <p className="text-gray-400 text-[10px] uppercase tracking-wider">Hearing</p>
              <p className="text-sm md:text-xl text-white font-medium">"{liveTranscript}"</p>
            </div>
          )}

          {appState === "error" && (
            <button onClick={() => { setErrorMessage(""); setAppState("idle"); }} className="text-gray-400 underline hover:text-white text-sm mt-2">
              ลองใหม่
            </button>
          )}
        </div>
      </section>

      {/* Right Column: Cart / Order Summary */}
      <section className="w-full landscape:w-1/2 h-1/2 landscape:h-full bg-[#1e293b] flex flex-col relative shadow-[inset_10px_0_20px_rgba(0,0,0,0.2)]">

        {/* Cart Header (Compact) */}
        <div className="p-4 md:p-8 pb-2 md:pb-4 border-b border-gray-700/50 flex justify-between items-center bg-[#1e293b] z-10 shrink-0">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-white">🛒 รายการอาหาร</h2>
          </div>
          <div className="bg-orange-500/10 text-orange-400 px-3 py-1 rounded-full text-xs md:text-sm font-bold border border-orange-500/20">
            {cart.length} รายการ
          </div>
        </div>

        {/* Scrollable Cart List */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50 relative">
              <svg className="w-16 h-16 md:w-24 md:h-24 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <p className="text-base md:text-lg">ยังไม่มีรายการอาหาร</p>
              <p className="text-xs md:text-sm mb-8">กดปุ่มไมโครโฟนเพื่อสั่งได้เลย</p>

              <button
                onClick={openManualModal}
                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-orange-400 border border-orange-500/30 rounded-xl font-bold transition-all flex items-center gap-2 hover:border-orange-500 hover:text-orange-500 shadow-lg"
              >
                <span>+</span> เพิ่มรายการเอง
              </button>
            </div>
          ) : (
            <>
              {cart.map((item, index) => (
                <div key={index} id={`cart-item-${index}`} className={`glass-dark rounded-2xl border border-white/5 relative group animate-slide-in overflow-hidden ${expandedIndex === index ? 'ring-2 ring-orange-500/30' : ''}`}>
                  {/* Accordion Header - Always Visible, Clickable */}
                  <div
                    onClick={() => setExpandedIndex(expandedIndex === index ? -1 : index)}
                    className="accordion-header p-4 md:p-5 cursor-pointer flex justify-between items-center"
                  >
                    <div className="flex items-center gap-3 md:gap-4 flex-1">
                      <div className="bg-slate-700/50 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-lg text-gray-400 font-mono text-base md:text-lg font-bold shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg md:text-xl font-bold text-white leading-tight truncate">{item.menu_name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-orange-400 text-sm md:text-base font-medium">{item.price}฿</span>
                          <span className="text-gray-500">×</span>
                          <span className="text-white font-bold">{item.quantity}</span>
                          {item.dineOption && (
                            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${item.dineOption === 'dine-in' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                              {item.dineOption === 'dine-in' ? '🍽️' : '📦'}
                            </span>
                          )}
                          {item.note && <span className="text-yellow-400 text-xs ml-2 truncate max-w-[100px]">📝 {item.note}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xl md:text-2xl font-bold text-white">{(item.price || 0) * item.quantity}<span className="text-gray-500 text-sm ml-1">฿</span></p>
                      <svg className={`accordion-chevron w-5 h-5 text-gray-400 ${expandedIndex === index ? 'expanded' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Accordion Content - Collapsible */}
                  <div className={`accordion-content px-4 md:px-5 ${expandedIndex === index ? 'expanded pb-4 md:pb-5' : 'collapsed'}`}>
                    {/* Add-ons & Quantity Controls */}
                    <div className="pt-2 md:pt-4 border-t border-gray-800 flex flex-wrap gap-3 md:gap-4 items-end justify-between">
                      {/* Add-ons */}
                      <div className="flex flex-wrap gap-2 flex-1">
                        {item.add_ons && item.add_ons.map((addon, aIdx) => (
                          <button
                            key={aIdx}
                            onClick={() => {
                              const newAddOns = [...item.add_ons];
                              newAddOns[aIdx] = { ...addon, selected: !addon.selected };
                              // Recalculate Logic
                              const basePrice = (item.price || 0) - item.add_ons.filter(a => a.selected).reduce((sum, a) => sum + a.price, 0);
                              const newPrice = basePrice + newAddOns.filter(a => a.selected).reduce((sum, a) => sum + a.price, 0);
                              updateCartItem(index, { ...item, add_ons: newAddOns, price: newPrice });
                            }}
                            className={`px-4 py-2 md:px-5 md:py-3 rounded-xl text-sm md:text-base font-bold transition-all border-2 ${addon.selected
                              ? "bg-green-500/20 text-green-400 border-green-500"
                              : "bg-slate-800 text-gray-400 border-slate-700 hover:border-gray-500 hover:bg-slate-700"
                              }`}
                          >
                            {addon.selected ? "✓ " : "+ "}{addon.name}
                          </button>
                        ))}
                      </div>

                      {/* Quantity Stepper */}
                      <div className="flex items-center gap-1 md:gap-2 bg-slate-800 rounded-xl p-1 md:p-1.5 border border-slate-700">
                        <button
                          onClick={() => {
                            if (item.quantity > 1) updateCartItem(index, { ...item, quantity: item.quantity - 1 });
                            else deleteFromCart(index);
                          }}
                          className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors active:bg-slate-500"
                        >
                          <svg className="w-6 h-6 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                        </button>
                        <span className="w-10 md:w-14 text-center text-xl md:text-2xl font-bold text-white">{item.quantity}</span>
                        <button
                          onClick={() => updateCartItem(index, { ...item, quantity: item.quantity + 1 })}
                          className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors active:bg-slate-500"
                        >
                          <svg className="w-6 h-6 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        </button>
                      </div>
                    </div>

                    {/* Note Section (Original Style) */}
                    <div className="mt-4 pt-4 border-t border-gray-800">
                      {item.note ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-xl md:text-2xl">📝</span>
                            <span className="text-yellow-400 text-lg md:text-xl">{item.note}</span>
                          </div>
                          <button
                            onClick={() => { setNoteMode(index); }}
                            className="px-4 py-2 bg-slate-800 rounded-lg text-sm md:text-base text-gray-300 hover:text-white hover:bg-slate-700 transition-colors"
                          >
                            แก้ไข
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setNoteMode(index);
                            // Small timeout to allow state update and then start recording
                            setTimeout(() => startRecording(), 50);
                          }}
                          className="w-full py-4 text-lg md:text-xl text-gray-300 hover:text-orange-400 bg-slate-800/50 hover:bg-orange-500/10 border-2 border-dashed border-gray-700 hover:border-orange-500/50 rounded-xl transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                        >
                          <span className="text-orange-500 text-2xl">🎤</span>
                          <span className="font-bold">เพิ่มรายละเอียด</span>
                          <span className="text-base text-gray-500 font-normal">(พูดได้เลย เช่น ไม่เผ็ด, ใส่กล่อง, เลือกเส้น)</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={openManualModal}
                className="w-full py-4 mt-4 border-2 border-dashed border-gray-700 hover:border-orange-500/50 rounded-xl text-gray-400 hover:text-orange-400 font-bold transition-all flex items-center justify-center gap-2 bg-slate-800/20 hover:bg-slate-800/50"
              >
                <span className="text-2xl">+</span> เพิ่มรายการอาหาร
              </button>
            </>
          )}
        </div>

        {/* Checkout Footer */}
        {cart.length > 0 && (
          <div className="p-4 md:p-8 glass border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.4)] z-10 shrink-0 glow-border-top">
            <div className="flex justify-between items-end mb-3 md:mb-6">
              <span className="text-gray-400 text-sm md:text-base">ยอดรวมทั้งสิ้น</span>
              <div className="text-right">
                <span className="text-3xl md:text-4xl font-bold gradient-text-orange">{getCartTotal()}</span>
                <span className="text-gray-400 ml-2 text-sm md:text-base">THB</span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 md:gap-5">
              <button
                onClick={() => { setCart([]); resetToIdle(); }}
                className="col-span-1 h-14 md:h-16 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-gray-400 font-bold border border-slate-700/50 active:scale-95 transition-all text-base md:text-lg hover:border-gray-600"
              >
                ล้าง
              </button>
              <button
                onClick={confirmOrder}
                disabled={appState === "processing"}
                className="col-span-3 h-14 md:h-16 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white text-xl md:text-2xl font-bold shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 transform active:scale-95 transition-all"
              >
                ยืนยันรายการ
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Note Mode Overlay - Just blur cart area */}
      {noteMode >= 0 && (
        <div
          className="fixed right-0 top-0 bottom-0 w-full landscape:w-1/2 z-40 bg-black/60 backdrop-blur-md animate-fade-in cursor-pointer"
          onClick={() => setNoteMode(-1)}
        />
      )}

      {/* Manual Order Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-[#1e293b] rounded-3xl w-full max-w-2xl h-[80vh] flex flex-col shadow-2xl border border-gray-700 animate-scale-in overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-[#0f172a]">
              <div>
                <h3 className="text-2xl font-bold text-white">
                  {selectedManualItem ? "ปรับแต่งรายการ" : "เลือกเมนูอาหาร"}
                </h3>
                {selectedManualItem && <button onClick={() => setSelectedManualItem(null)} className="text-sm text-gray-400 hover:text-white flex items-center gap-1 mt-1">← ย้อนกลับไปเลือกเมนู</button>}
              </div>
              <button onClick={() => setShowManualModal(false)} className="text-gray-400 hover:text-white bg-slate-800 p-2 rounded-full">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[#1e293b]">
              {!selectedManualItem ? (
                /* Step 1: Menu Selection */
                <div className="space-y-6">
                  {/* Search */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="ค้นหาเมนู..."
                      value={manualSearch}
                      onChange={(e) => setManualSearch(e.target.value)}
                      className="w-full bg-slate-900 border border-gray-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-all text-lg"
                      autoFocus
                    />
                    <svg className="w-6 h-6 text-gray-500 absolute left-4 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>

                  {/* Categories */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {menuItems
                      .filter(item => item.name.includes(manualSearch))
                      .map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setSelectedManualItem(item)}
                          className="bg-slate-800 hover:bg-slate-700 p-4 rounded-xl border border-gray-700 hover:border-orange-500/50 transition-all text-left group"
                        >
                          <div className="font-bold text-lg text-white group-hover:text-orange-400 mb-1">{item.name}</div>
                          <div className="text-gray-400 text-sm">{item.base_price} บาท</div>
                        </button>
                      ))}
                  </div>
                  {menuItems.filter(item => item.name.includes(manualSearch)).length === 0 && (
                    <div className="text-center text-gray-500 py-10">ไม่พบเมนูที่ค้นหา</div>
                  )}
                </div>
              ) : (
                /* Step 2: Customization */
                <div className="space-y-8">
                  {/* Item Info */}
                  <div className="flex justify-between items-start">
                    <h2 className="text-3xl font-bold text-white leading-tight">{selectedManualItem.name}</h2>
                    <span className="text-2xl font-bold text-orange-400">{selectedManualItem.base_price}฿</span>
                  </div>

                  {/* Add-ons */}
                  <div>
                    <h4 className="text-gray-400 font-bold mb-3 uppercase text-sm tracking-wider">ตัวเลือกเพิ่มเติม</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {addonOptions.map((opt) => (
                        <button
                          key={opt.name}
                          onClick={() => {
                            setManualAddons(prev =>
                              prev.includes(opt.name) ? prev.filter(n => n !== opt.name) : [...prev, opt.name]
                            );
                          }}
                          className={`p-3 rounded-xl border-2 flex items-center justify-between transition-all ${manualAddons.includes(opt.name)
                            ? "bg-green-500/20 border-green-500 text-green-400"
                            : "bg-slate-800 border-slate-700 text-gray-400 hover:border-gray-500"
                            }`}
                        >
                          <span className="font-bold flex items-center gap-2">
                            <span>{opt.emoji}</span> {opt.name}
                          </span>
                          <span className="text-sm">+{opt.price}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quantity */}
                  <div>
                    <h4 className="text-gray-400 font-bold mb-3 uppercase text-sm tracking-wider">จำนวน</h4>
                    <div className="flex items-center gap-4">
                      <button onClick={() => manualQuantity > 1 && setManualQuantity(q => q - 1)} className="w-14 h-14 bg-slate-800 rounded-xl text-2xl font-bold hover:bg-slate-700">-</button>
                      <span className="text-3xl font-bold text-white w-12 text-center">{manualQuantity}</span>
                      <button onClick={() => setManualQuantity(q => q + 1)} className="w-14 h-14 bg-slate-800 rounded-xl text-2xl font-bold hover:bg-slate-700">+</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer (Only for Step 2) */}
            {selectedManualItem && (
              <div className="p-6 border-t border-gray-700 bg-[#0f172a] flex justify-between items-center">
                <div className="text-left">
                  <div className="text-sm text-gray-400">ราคารวม</div>
                  <div className="text-3xl font-bold text-orange-400">
                    {(selectedManualItem.base_price + addonOptions.filter(o => manualAddons.includes(o.name)).reduce((s, a) => s + a.price, 0)) * manualQuantity}฿
                  </div>
                </div>
                <button
                  onClick={handleManualAdd}
                  className="px-8 py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-bold text-xl shadow-lg shadow-orange-500/20 active:scale-95 transition-all"
                >
                  เพิ่มรายการ
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Order Type Selection Modal */}
      {showOrderTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl border border-slate-700/50 animate-scale-in transform transition-all">
            <div className="text-center">
              <h3 className="text-2xl md:text-3xl font-bold text-white mb-2">ทานที่ร้าน หรือ กลับบ้าน?</h3>
              <p className="text-gray-400 mb-8">กรุณาเลือกรูปแบบการรับอาหาร</p>

              <div className="grid grid-cols-2 gap-4 md:gap-6">
                <button
                  onClick={() => submitOrder("dine-in")}
                  className="group relative h-40 rounded-2xl bg-gradient-to-br from-blue-600/20 to-blue-800/20 hover:from-blue-600/40 hover:to-blue-800/40 border-2 border-blue-500/30 hover:border-blue-400 transition-all active:scale-[0.98] flex flex-col items-center justify-center gap-3"
                >
                  <span className="text-5xl md:text-6xl filter drop-shadow-lg group-hover:scale-110 transition-transform duration-300">🍽️</span>
                  <span className="text-xl md:text-2xl font-bold text-blue-300 group-hover:text-white">ทานที่ร้าน</span>
                </button>

                <button
                  onClick={() => submitOrder("takeaway")}
                  className="group relative h-40 rounded-2xl bg-gradient-to-br from-orange-600/20 to-orange-800/20 hover:from-orange-600/40 hover:to-orange-800/40 border-2 border-orange-500/30 hover:border-orange-400 transition-all active:scale-[0.98] flex flex-col items-center justify-center gap-3"
                >
                  <span className="text-5xl md:text-6xl filter drop-shadow-lg group-hover:scale-110 transition-transform duration-300">🥡</span>
                  <span className="text-xl md:text-2xl font-bold text-orange-300 group-hover:text-white">กลับบ้าน</span>
                </button>
              </div>

              <button
                onClick={() => setShowOrderTypeModal(false)}
                className="mt-8 text-gray-500 hover:text-white underline decoration-gray-600 hover:decoration-white transition-colors text-sm"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
