import axios from "axios";

const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

const axiosInstance = axios.create({
  baseURL,
  withCredentials: true,
});

axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Check if error is 401 Unauthorized and request has not been retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Attempt to call the refresh endpoint
        await axios.post(`${baseURL}/auth/refresh`, {}, { withCredentials: true });

        // Retry the original request with the custom axios instance
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        console.error("Refresh token failed, logging out:", refreshError);
        
        // Clear local username and tickets state if any
        if (typeof window !== "undefined") {
          localStorage.removeItem("userName");
          sessionStorage.removeItem("userName");
          sessionStorage.removeItem("heldTickets");
          window.location.href = "/";
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
