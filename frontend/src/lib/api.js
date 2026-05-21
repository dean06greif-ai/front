import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = BACKEND_URL;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

export const wsUrl = () => {
  const url = new URL(BACKEND_URL);
  const proto = url.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${url.host}/ws`;
};

