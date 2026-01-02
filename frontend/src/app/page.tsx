"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// Types
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
}

interface OrderResponse {
  success: boolean;
  transcript?: string;
  items: OrderItem[];
  total_price: number;
  raw_gemini_response?: string;
  error?: string;
}

type AppState = "idle" | "recording" | "processing" | "review" | "confirmed" | "error";

// Backend URL: Use relative "/api" path to leverage Next.js Rewrites (Proxies to 8000)
// This solves Mixed Content (HTTPS->HTTP) and CORS/Network issues on mobile
const BACKEND_URL = "/api";

export default function VoiceOrderPage() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [orderData, setOrderData] = useState<OrderResponse | null>(null);
  const [cart, setCart] = useState<OrderItem[]>([]); // Persistent cart
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [confirmationMessage, setConfirmationMessage] = useState<string>("");
  const [liveTranscript, setLiveTranscript] = useState<string>(""); // Real-time transcript
  const [recordingTime, setRecordingTime] = useState<number>(0); // Recording duration

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
  const processTranscript = async () => {
    try {
      // Use the transcript from ref (state might not be updated yet due to React closure)
      const transcript = transcriptRef.current.trim();

      // Clear transcript ref immediately to prevent double processing if called twice
      transcriptRef.current = "";

      if (!transcript) {
        setErrorMessage("ไม่ได้ยินเสียง กรุณาลองพูดอีกครั้ง");
        setAppState("error");
        return;
      }

      const response = await fetch(`${BACKEND_URL}/process-text-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transcript }),
      });

      const data: OrderResponse = await response.json();

      if (data.success && data.items.length > 0) {
        // ADD to cart instead of replacing
        const newItem = data.items[0];
        setCart(prevCart => [...prevCart, newItem]);
        setOrderData(data);
        // STAY ON IDLE to allow continuous ordering (Cart is visible on right)
        setAppState("idle");
        setLiveTranscript(""); // Clear live transcript on success
      } else {
        setErrorMessage(data.error || "ไม่พบรายการอาหารในคำสั่ง กรุณาลองใหม่อีกครั้ง");
        setAppState("error");
      }
    } catch (error) {
      console.error("Error processing transcript:", error);
      setErrorMessage("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      setAppState("error");
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
    setAppState("processing");

    // Stop Speech Recognition
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    // Stop Timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    // Process immediately
    await processTranscript();
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

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = "th-TH";
      recognition.continuous = true;
      recognition.interimResults = true;

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
        const fullTranscript = finalTranscript + interimTranscript;
        setLiveTranscript(fullTranscript);
        transcriptRef.current = fullTranscript;

        // Auto-detect: if we have a final result with a menu item, stop and process
        if (finalTranscript && detectMenuItem(finalTranscript)) {
          console.log("Menu detected, auto-stopping:", finalTranscript);
          stopRecording(); // Use the unified stop function
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onerror = (event: any) => {
        console.log("Speech recognition error:", event.error);
        if (event.error === "no-speech") {
          setLiveTranscript("(ไม่ได้ยินเสียง - กรุณาพูดใกล้ไมค์)");
        } else if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setErrorMessage("⚠️ ไม่สามารถเข้าถึงไมโครโฟนได้ (Permission Denied)");
          setAppState("error");
        }
      };

      recognition.onend = () => {
        // Optionally handle restart if we wanted continuous listening, but here we let it stop
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

      // Security check for Microphone on non-localhost/non-https
      if (window.location.hostname !== "localhost" && window.location.protocol !== "https:") {
        setErrorMessage("⚠️ ไมค์ใช้ไม่ได้บน HTTP (ต้องใช้ HTTPS หรือ localhost)");
        setAppState("error");
        return;
      }

      setLiveTranscript("");
      setRecordingTime(0);

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

  // Confirm order
  const confirmOrder = async () => {
    // Check both React state AND the Ref lock
    if (cart.length === 0 || appState === "processing" || isSubmittingRef.current) return;

    // Immediately lock
    isSubmittingRef.current = true;
    setAppState("processing");

    try {
      const response = await fetch(`${BACKEND_URL}/confirm-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: cart,
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
    transcriptRef.current = "";
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
          <div className="text-center h-8 flex flex-col justify-end">
            {appState === "idle" && <p className="text-lg md:text-2xl text-gray-300 font-medium animate-fade-in">กดปุ่มแล้วพูด</p>}
            {appState === "recording" && <p className="text-xl md:text-3xl text-red-500 font-bold animate-pulse">กำลังฟัง... {formatTime(recordingTime)}</p>}
            {appState === "processing" && <p className="text-xl md:text-2xl text-blue-400 font-bold animate-pulse">กำลังประมวลผล...</p>}
            {appState === "error" && <p className="text-sm md:text-lg text-red-400 font-bold bg-red-500/10 px-3 py-1 rounded-lg">{errorMessage}</p>}
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
              ${appState === "idle" || appState === "review" || appState === "error" ? "bg-slate-800 hover:bg-slate-700 shadow-xl border-4 border-slate-700 hover:scale-105" : ""}
              ${appState === "recording" ? "bg-red-500/10 shadow-[0_0_50px_rgba(239,68,68,0.4)] scale-110 border-4 border-red-500 animate-pulse" : ""}
              ${appState === "processing" ? "bg-slate-800 border-4 border-blue-500 opacity-80 cursor-not-allowed" : ""}
              ${appState === "confirmed" ? "bg-green-500 text-white border-4 border-green-400 scale-100" : ""}
            `}
          >
            <div className="relative z-10 flex flex-col items-center">
              {(appState === "idle" || appState === "review" || appState === "error") && (
                <>
                  <svg className="w-16 h-16 landscape:w-12 landscape:h-12 md:w-24 md:h-24 text-orange-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  <span className="text-lg landscape:text-base md:text-2xl font-bold text-white">{cart.length > 0 ? "สั่งเพิ่ม" : "เริ่มสั่ง"}</span>
                </>
              )}
              {appState === "recording" && (
                <svg className="w-16 h-16 md:w-24 md:h-24 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" /></svg>
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
            <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50">
              <svg className="w-16 h-16 md:w-24 md:h-24 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <p className="text-base md:text-lg">ยังไม่มีรายการอาหาร</p>
              <p className="text-xs md:text-sm">กดปุ่มไมโครโฟนเพื่อสั่งได้เลย</p>
            </div>
          ) : (
            cart.map((item, index) => (
              <div key={index} className="bg-[#0f172a] rounded-xl p-4 md:p-5 border border-gray-700/50 relative group">
                <div className="flex justify-between items-start mb-2 md:mb-4 pr-0">
                  <div className="flex items-start gap-3 md:gap-4">
                    <div className="bg-slate-700/50 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-lg text-gray-400 font-mono text-base md:text-lg font-bold shrink-0">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="text-xl md:text-2xl font-bold text-white leading-tight">{item.menu_name}</h3>
                      {item.price && <p className="text-orange-400 text-base md:text-lg font-medium mt-1">{item.price} ฿ / ที่</p>}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-2xl md:text-3xl font-bold text-white">{(item.price || 0) * item.quantity}</p>
                    <p className="text-xs md:text-sm text-gray-500">บาท</p>
                  </div>
                </div>

                {/* Add-ons & Quantity Controls */}
                <div className="mt-2 md:mt-4 pt-2 md:pt-4 border-t border-gray-800 flex flex-wrap gap-3 md:gap-4 items-end justify-between">
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
                        className={`px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-xs md:text-sm font-bold transition-all border-2 ${addon.selected
                          ? "bg-green-500/20 text-green-400 border-green-500"
                          : "bg-slate-800 text-gray-400 border-slate-700 hover:border-gray-500 hover:bg-slate-700"
                          }`}
                      >
                        {addon.selected ? "✓ " : "+ "}{addon.name}
                      </button>
                    ))}
                  </div>

                  {/* Quantity Stepper & Delete */}
                  <div className="flex items-center gap-2 md:gap-3">
                    {/* Delete Button */}
                    <button
                      onClick={() => deleteFromCart(index)}
                      className="h-10 w-14 md:h-14 md:w-20 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500 hover:text-white text-base md:text-xl font-bold transition-all active:scale-95 flex items-center justify-center"
                    >
                      ลบ
                    </button>

                    <div className="flex items-center gap-1 md:gap-2 bg-slate-800 rounded-xl p-1 md:p-1.5 border border-slate-700">
                      <button
                        onClick={() => {
                          if (item.quantity > 1) updateCartItem(index, { ...item, quantity: item.quantity - 1 });
                          else deleteFromCart(index);
                        }}
                        className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors active:bg-slate-500"
                      >
                        <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                      </button>
                      <span className="w-8 md:w-10 text-center text-lg md:text-xl font-bold text-white">{item.quantity}</span>
                      <button
                        onClick={() => updateCartItem(index, { ...item, quantity: item.quantity + 1 })}
                        className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors active:bg-slate-500"
                      >
                        <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Checkout Footer */}
        {cart.length > 0 && (
          <div className="p-4 md:p-8 bg-[#1e293b] border-t border-gray-700/50 shadow-[0_-10px_40px_rgba(0,0,0,0.3)] z-10 shrink-0">
            <div className="flex justify-between items-end mb-3 md:mb-6">
              <span className="text-gray-400 text-sm md:text-base">ยอดรวมทั้งสิ้น</span>
              <div className="text-right">
                <span className="text-3xl md:text-4xl font-bold text-white">{getCartTotal()}</span>
                <span className="text-gray-400 ml-2 text-sm md:text-base">THB</span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 md:gap-4">
              <button
                onClick={() => { setCart([]); resetToIdle(); }}
                className="col-span-1 h-12 md:h-14 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-400 font-bold border border-slate-700 active:scale-95 transition-transform text-sm md:text-base"
              >
                ล้าง
              </button>
              <button
                onClick={confirmOrder}
                disabled={appState === "processing"}
                className="col-span-3 h-12 md:h-14 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white text-lg md:text-xl font-bold shadow-lg shadow-orange-500/20 transform active:scale-95 transition-all"
              >
                ยืนยันรายการ
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
