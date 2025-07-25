// import React from "react";
// import ReactDOM from "react-dom/client";
// import App from "./App.jsx";
// import "./index.css"; // Keep your global CSS

// import Keycloak from "keycloak-js";

// // --- Keycloak Configuration ---
// const keycloakInstance = new Keycloak({
//   url: "http://localhost:8080", // e.g., 'http://localhost:8080/' or 'http://your-keycloak-domain.com/auth'
//   realm: "felix-realm", // The realm name you created in Keycloak
//   clientId: "felix-frontend-client", // The client ID you created for your React app
// });
// // --- End Keycloak Configuration ---

// // Function to initialize Keycloak and render the app
// const initKeycloak = async () => {
//   try {
//     const authenticated = await keycloakInstance.init({
//       onLoad: "login-required", // Redirects to login page if not authenticated
//       checkLoginIframe: false, // For development simplicity, but review for production
//       silentCheckSsoRedirectUri:
//         window.location.origin + "/silent-check-sso.html", // Required for silent SSO checks, create this file if needed
//     });

//     if (authenticated) {
//       console.log("User is authenticated:", keycloakInstance.tokenParsed);
//       // You can store tokens or user info in context/state here if needed
//       ReactDOM.createRoot(document.getElementById("root")).render(
//         <React.StrictMode>
//           <App keycloak={keycloakInstance} />{" "}
//           {/* Pass keycloak instance to App */}
//         </React.StrictMode>
//       );
//     } else {
//       console.log("User is NOT authenticated. Redirecting to login...");
//       // Keycloak init with 'login-required' already handles redirect
//     }
//   } catch (error) {
//     console.error("Keycloak initialization failed:", error);
//     // Render an error message or fallback UI if Keycloak fails
//     ReactDOM.createRoot(document.getElementById("root")).render(
//       <React.StrictMode>
//         <div>Error connecting to authentication server. Please try again.</div>
//       </React.StrictMode>
//     );
//   }
// };

// // Call the initialization function
// initKeycloak();

// frontend/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css"; // Keep your global CSS

import Keycloak from "keycloak-js";
// NEW: Import BrowserRouter
import { BrowserRouter } from "react-router-dom";

// --- Keycloak Configuration ---
const keycloakInstance = new Keycloak({
  url: "http://localhost:8080",
  realm: "felix-realm",
  clientId: "felix-frontend-client",
});
// --- End Keycloak Configuration ---

// Function to initialize Keycloak and render the app
const initKeycloak = async () => {
  try {
    const authenticated = await keycloakInstance.init({
      onLoad: "login-required",
      checkLoginIframe: false,
      silentCheckSsoRedirectUri:
        window.location.origin + "/silent-check-sso.html",
    });

    if (authenticated) {
      console.log("User is authenticated:", keycloakInstance.tokenParsed);
      ReactDOM.createRoot(document.getElementById("root")).render(
        <React.StrictMode>
          {/* NEW: Wrap App with BrowserRouter */}
          <BrowserRouter>
            <App keycloak={keycloakInstance} />
          </BrowserRouter>
        </React.StrictMode>
      );
    } else {
      console.log("User is NOT authenticated. Redirecting to login...");
    }
  } catch (error) {
    console.error("Keycloak initialization failed:", error);
    ReactDOM.createRoot(document.getElementById("root")).render(
      <React.StrictMode>
        <div>Error connecting to authentication server. Please try again.</div>
      </React.StrictMode>
    );
  }
};

// Call the initialization function
initKeycloak();
