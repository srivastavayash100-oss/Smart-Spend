importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Optional: custom background handler
messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || 'Smart Spend';
  const notificationOptions = {
    body: payload.notification?.body || 'New money moment',
    icon: 'icon.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
