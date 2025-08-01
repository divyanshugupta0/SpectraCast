// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBswvgO9-XwDKECriTm_GGHImVG9fBm5wo",
  authDomain: "screenshare-86bac.firebaseapp.com",
  projectId: "screenshare-86bac",
  storageBucket: "screenshare-86bac.firebasestorage.app",
  messagingSenderId: "499824954816",
  appId: "1:499824954816:web:6221a47839ffaa2d9b8c25",
  measurementId: "G-F8LN03F57S"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

export { app, analytics, db };