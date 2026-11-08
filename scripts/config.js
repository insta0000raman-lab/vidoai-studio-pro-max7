
/* =========================================
   VPEET STUDIO
   Central Configuration
   ========================================= */

window.VPEET_CONFIG = {

  appName: "VPEET Studio",
  fullName: "Vid Pro Editing Easy Tools",
  tagline: "PRO EDITING. MADE EASY.",
  version: "1.0.0",

  /* WIZARD STEPS */
  steps: [
    { id: 0, title: "Upload Video" },
    { id: 1, title: "Aspect Ratio" },
    { id: 2, title: "Remove Borders" },
    { id: 3, title: "Border Amount" },
    { id: 4, title: "Video Position" },
    { id: 5, title: "Quality" },
    { id: 6, title: "Trim Start" },
    { id: 7, title: "Trim End" },
    { id: 8, title: "Sharpen" },
    { id: 9, title: "Colour & Enhancement" },
    { id: 10, title: "Text & Layers" },
    { id: 11, title: "Audio" },
    { id: 12, title: "Effects" },
    { id: 13, title: "Export Settings" },
    { id: 14, title: "Final Preview" },
    { id: 15, title: "Render & Export" }
  ],

  totalSteps: 16,

  /* ASPECT RATIO PRESETS */
  aspectRatios: [
    {
      id: "9:16",
      label: "9:16",
      width: 1080,
      height: 1920
    },
    {
      id: "16:9",
      label: "16:9",
      width: 1920,
      height: 1080
    },
    {
      id: "1:1",
      label: "1:1",
      width: 1080,
      height: 1080
    },
    {
      id: "4:5",
      label: "4:5",
      width: 1080,
      height: 1350
    },
    {
      id: "5:4",
      label: "5:4",
      width: 1350,
      height: 1080
    },
    {
      id: "4:3",
      label: "4:3",
      width: 1440,
      height: 1080
    },
    {
      id: "3:4",
      label: "3:4",
      width: 1080,
      height: 1440
    },
    {
      id: "3:2",
      label: "3:2",
      width: 1620,
      height: 1080
    },
    {
      id: "2:3",
      label: "2:3",
      width: 1080,
      height: 1620
    },
    {
      id: "21:9",
      label: "21:9",
      width: 2520,
      height: 1080
    },
    {
      id: "9:21",
      label: "9:21",
      width: 1080,
      height: 2520
    },
    {
      id: "2:1",
      label: "2:1",
      width: 2160,
      height: 1080
    },
    {
      id: "1.91:1",
      label: "1.91:1",
      width: 1910,
      height: 1000
    },
    {
      id: "1:2",
      label: "1:2",
      width: 1080,
      height: 2160
    }
  ],

  /* DEFAULT PROJECT SETTINGS */
  defaults: {

    aspectRatio: "9:16",

    customRatio: {
      width: 1080,
      height: 1920
    },

    borderMode: "crop",
    borderAmount: 0,

    videoPosition: {
      x: 50,
      y: 50,
      zoom: 100
    },

    quality: "high",

    trimStart: 0,
    trimEnd: null,
    useFullVideo: true,

    sharpen: 0,

    enhancement: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      temperature: 0
    },

    audio: {
      enabled: false,
      volume: 100,
      fadeIn: 0,
      fadeOut: 0
    },

    effect: "none",

    export: {
      resolution: 1080,
      fps: 30,
      bitrate: 8,
      format: "mp4",
      videoCodec: "libx264",
      audioCodec: "aac"
    }

  },

  /* TEXT PRESETS */
  textPresets: {

    cinematic: {
      name: "Cinematic",
      fontFamily: "Georgia",
      fontSize: 58,
      fontWeight: "bold",
      color: "#ffffff",
      strokeColor: "#000000",
      strokeWidth: 2,
      shadow: true,
      align: "center",
      position: "center"
    },

    glow: {
      name: "Glow",
      fontFamily: "Arial",
      fontSize: 60,
      fontWeight: "bold",
      color: "#ffffff",
      strokeColor: "#8b7cff",
      strokeWidth: 1,
      shadow: true,
      glow: true,
      align: "center",
      position: "center"
    },

    minimal: {
      name: "Minimal",
      fontFamily: "Arial",
      fontSize: 44,
      fontWeight: "normal",
      color: "#ffffff",
      strokeColor: "#000000",
      strokeWidth: 0,
      shadow: false,
      align: "center",
      position: "bottom"
    },

    bold: {
      name: "Bold",
      fontFamily: "Arial",
      fontSize: 64,
      fontWeight: "900",
      color: "#ffffff",
      strokeColor: "#000000",
      strokeWidth: 3,
      shadow: true,
      align: "center",
      position: "center"
    },

    social: {
      name: "Social",
      fontFamily: "Arial",
      fontSize: 54,
      fontWeight: "bold",
      color: "#ffffff",
      strokeColor: "#000000",
      strokeWidth: 2,
      shadow: true,
      align: "center",
      position: "bottom"
    }

  },

  /* EFFECT PRESETS */
  effects: [
    { id: "none", name: "None" },
    { id: "vintage", name: "Vintage" },
    { id: "cinematic", name: "Cinematic" },
    { id: "film", name: "Film" },
    { id: "blackwhite", name: "Black & White" }
  ],

  /* EXPORT LIMITS */
  exportOptions: {
    resolutions: [720, 1080, 1440, 2160],
    frameRates: [24, 30, 60],
    bitrates: [5, 8, 12, 16, 25, 40],
    formats: ["mp4"]
  },

  /* BORDER OPTIONS */
  borderOptions: {
    modes: ["crop", "blur"],
    minimum: 0,
    maximum: 20
  },

  /* TEXT LAYER OPTIONS */
  textLayerOptions: {
    minimumFontSize: 10,
    maximumFontSize: 200,
    maximumLayers: 50,
    defaultDuration: 3,
    defaultPosition: {
      x: 50,
      y: 50
    }
  }

};

console.log("VPEET Studio configuration loaded.");
    
