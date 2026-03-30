import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD2AFZPUwL5toQVIbHFvOwApDhyLX0tRhg",
  authDomain: "interview-92592.firebaseapp.com",
  projectId: "interview-92592",
  storageBucket: "interview-92592.firebasestorage.app",
  messagingSenderId: "268582695816",
  appId: "1:268582695816:web:6d11188e225e2ae516003d"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export { doc, getDoc, setDoc };