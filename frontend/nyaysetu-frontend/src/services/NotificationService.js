import axios from 'axios';
import { API_BASE_URL } from '../config/apiConfig';

class NotificationService {
    constructor() {
        this.ws = null;
        this.listeners = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.API_BASE_URL = API_BASE_URL;
        this.isConnecting = false;
        this.connectionFailed = false;
    }

    /**
     * Connects to the WebSocket for real-time notifications securely
     */
    connect(token) {
        // Skip if already connected, connecting, or permanently failed
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }
        if (this.isConnecting || this.connectionFailed) {
            return;
        }
        if (!token || token === 'null' || token === 'undefined') {
            return;
        }

        const isProduction = !window.location.hostname.includes('localhost');

        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = new URL(this.API_BASE_URL).host;

            // REMOVED: ?token=${token} is gone from the URL string
            const wsUrl = `${protocol}//${host}/api/ws/notifications`;

            this.isConnecting = true;

            if (!isProduction) {
                console.log('Connecting to notification WebSocket...');
            }

            this.ws = new WebSocket(wsUrl);

            // Handshake established - immediately pass token down the channel
            this.ws.onopen = () => {
                this.ws.send(JSON.stringify({
                    type: 'AUTH',
                    token: token
                }));
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);

                    if (message.type === 'AUTH_SUCCESS') {
                        if (!isProduction) {
                            console.log('✅ Notification WebSocket authenticated');
                        }
                        this.reconnectAttempts = 0;
                        this.isConnecting = false;
                        this.connectionFailed = false;
                        return;
                    }

                    if (message.type === 'AUTH_ERROR') {
                        this.isConnecting = false;
                        this.connectionFailed = true;
                        this.disconnect();
                        return;
                    }

                    if (message.type === 'NOTIFICATION') {
                        // Extract payload specifically mapped by your backend listener
                        this.notifyListeners(message.payload);
                        return;
                    }

                    // Fallback wrapper
                    this.notifyListeners(message);
                } catch (error) {
                    if (!isProduction) {
                        console.warn('Invalid notification WebSocket message format received');
                    }
                }
            };

            this.ws.onerror = () => {
                this.isConnecting = false;
            };

            this.ws.onclose = (event) => {
                this.isConnecting = false;
                this.ws = null;

                // Code 1008 means the backend closed due to authentication failure
                if (event.code === 1008) {
                    this.connectionFailed = true;
                    return;
                }

                if (!this.connectionFailed) {
                    this.attemptReconnect(token);
                }
            };
        } catch (error) {
            this.isConnecting = false;
            this.connectionFailed = true;
        }
    }

    /**
     * Reconnection logic with exponential backoff
     */
    attemptReconnect(token) {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

            setTimeout(() => {
                this.connect(token);
            }, delay);
        } else {
            this.connectionFailed = true;
        }
    }

    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    notifyListeners(notification) {
        this.listeners.forEach(callback => {
            try {
                callback(notification);
            } catch (error) {
                // Silent fail to avoid crashing the service if a component breaks
            }
        });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.listeners = [];
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.connectionFailed = false;
    }

    // --- REST API Methods ---

    async fetchNotifications(userId) {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${this.API_BASE_URL}/api/notifications/user/${userId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data;
        } catch (error) {
            return [];
        }
    }

    async markRead(id) {
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${this.API_BASE_URL}/api/notifications/${id}/read`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (error) {
            // Silent fail
        }
    }
}

export default new NotificationService();