import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// TODO: Replace these placeholder values with your actual Firebase project config
// from the Firebase Console -> Project Settings -> General -> Web App
const firebaseConfig = {
  apiKey: "AIzaSyCIyPNPuukS9bBCjCanJYKWb6wLL7clumQ",
  authDomain: "todolistpro-85d7c.firebaseapp.com",
  projectId: "todolistpro-85d7c",
  storageBucket: "todolistpro-85d7c.firebasestorage.app",
  messagingSenderId: "912593768467",
  appId: "1:912593768467:web:d15c4a030181ed370aafe6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
