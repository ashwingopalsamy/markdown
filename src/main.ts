import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

mount(App, { target: document.getElementById('app')! })
if (import.meta.env.PROD && !__LOCAL__) navigator.serviceWorker?.register('/sw.js').catch(() => {})
