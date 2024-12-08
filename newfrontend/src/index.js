import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import '@fortawesome/fontawesome-free/css/all.min.css';

// 永続ストレージの設定
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist()
    .then((granted) => {
      if (granted) {
        console.log("Persistent storage granted.");
      } else {
        console.log("Persistent storage not granted.");
      }
    })
    .catch((error) => {
      console.error("Error requesting persistent storage:", error);
    });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
