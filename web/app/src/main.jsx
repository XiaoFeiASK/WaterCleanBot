import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import './styles-scale.css';
import './features.css';
import './auth.css';
import App from './App';
import AccountPage from './AccountPage';
import AuthPage from './AuthPage';
import { AuthProvider } from './AuthContext';
import ProtectedRoute from './ProtectedRoute';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><BrowserRouter><AuthProvider><Routes>
    <Route path="/login" element={<AuthPage mode="login"/>}/>
    <Route path="/register" element={<AuthPage mode="register"/>}/>
    <Route element={<ProtectedRoute/>}>
      <Route path="/" element={<App/>}/>
      <Route path="/account" element={<AccountPage/>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Route>
  </Routes></AuthProvider></BrowserRouter></React.StrictMode>,
);
