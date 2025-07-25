// // frontend/src/App.jsx
// import { useState, useEffect } from "react";
// import "./App.css";

// function App({ keycloak }) {
//   const [count, setCount] = useState(0);
//   const [username, setUsername] = useState("Guest");
//   const [roles, setRoles] = useState([]);
//   const [protectedMessage, setProtectedMessage] = useState("");
//   const [adminMessage, setAdminMessage] = useState("");
//   const [publicMessage, setPublicMessage] = useState("");

//   // --- WALLET MANAGEMENT STATE (Existing) ---
//   const [walletCreated, setWalletCreated] = useState(false);
//   const [walletPublicKey, setWalletPublicKey] = useState(null);
//   const [walletError, setWalletError] = useState(null);
//   const [walletStatusMessage, setWalletStatusMessage] = useState(
//     "Checking wallet status..."
//   );
//   // --- END WALLET MANAGEMENT STATE ---

//   // --- BALANCES STATE (Existing) ---
//   const [stellarBalances, setStellarBalances] = useState([]);
//   const [balancesLoading, setBalancesLoading] = useState(true);
//   const [balancesError, setBalancesError] = useState(null);
//   // --- END BALANCES STATE ---

//   // --- NEW STATE FOR TRANSACTION HISTORY ---
//   const [transactionHistory, setTransactionHistory] = useState([]);
//   const [historyLoading, setHistoryLoading] = useState(true);
//   const [historyError, setHistoryError] = useState(null);
//   // --- END NEW STATE ---

//   useEffect(() => {
//     if (keycloak && keycloak.authenticated) {
//       setUsername(keycloak.tokenParsed.preferred_username || "User");
//       setRoles(keycloak.tokenParsed.realm_access.roles || []);

//       // Fetch protected data when authenticated
//       fetchData("/api/protected", setProtectedMessage);
//       fetchData("/api/admin-only", setAdminMessage); // Test admin-only route

//       // --- Trigger post-login setup for user and wallet, which now includes balances & history ---
//       handlePostLoginSetup();
//     }
//     fetchData("/api/public", setPublicMessage); // Fetch public data on mount
//   }, [keycloak]); // Re-run effect when keycloak object changes (e.g., after login)

//   // --- EXISTING FUNCTION: Fetch Stellar Balances ---
//   const fetchBalances = async (token) => {
//     setBalancesLoading(true);
//     setBalancesError(null);
//     try {
//       const response = await fetch(
//         "http://localhost:3001/api/wallet/balances",
//         {
//           method: "GET",
//           headers: {
//             Authorization: `Bearer ${token}`,
//             "Content-Type": "application/json",
//           },
//         }
//       );

//       const data = await response.json();
//       if (response.ok) {
//         setStellarBalances(data.balances);
//         console.log("Stellar Balances:", data.balances);
//       } else {
//         setBalancesError(data.message || "Failed to fetch balances.");
//         console.error("Error fetching balances:", data.message);
//       }
//     } catch (error) {
//       setBalancesError(error.message || "Network error fetching balances.");
//       console.error("Network error fetching balances:", error);
//     } finally {
//       setBalancesLoading(false);
//     }
//   };
//   // --- END EXISTING FUNCTION ---

//   // --- NEW FUNCTION: Fetch Transaction History ---
//   const fetchTransactionHistory = async (token) => {
//     setHistoryLoading(true);
//     setHistoryError(null);
//     try {
//       const response = await fetch(
//         "http://localhost:3001/api/wallet/transactions",
//         {
//           method: "GET",
//           headers: {
//             Authorization: `Bearer ${token}`,
//             "Content-Type": "application/json",
//           },
//         }
//       );

//       const data = await response.json();
//       if (response.ok) {
//         setTransactionHistory(data.transactions);
//         console.log("Transaction History:", data.transactions);
//       } else {
//         setHistoryError(data.message || "Failed to fetch transaction history.");
//         console.error("Error fetching transaction history:", data.message);
//       }
//     } catch (error) {
//       setHistoryError(
//         error.message || "Network error fetching transaction history."
//       );
//       console.error("Network error fetching transaction history:", error);
//     } finally {
//       setHistoryLoading(false);
//     }
//   };
//   // --- END NEW FUNCTION ---

//   // --- MODIFIED FUNCTION: handlePostLoginSetup now includes balance & history fetching ---
//   const handlePostLoginSetup = async () => {
//     if (!keycloak || !keycloak.authenticated || !keycloak.token) {
//       return; // Ensure Keycloak is ready
//     }

//     try {
//       // 1. Sync User to Supabase (existing logic)
//       setWalletStatusMessage("Syncing user data...");
//       const syncResponse = await fetch("http://localhost:3001/api/user/sync", {
//         method: "POST",
//         headers: {
//           Authorization: `Bearer ${keycloak.token}`,
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({}),
//       });
//       const syncData = await syncResponse.json();
//       if (!syncResponse.ok) {
//         console.error("Error syncing user:", syncData.message);
//         setWalletStatusMessage(`Error syncing user: ${syncData.message}`);
//         setWalletError(syncData.message);
//         return;
//       }
//       console.log("User sync response:", syncData.message);

//       // 2. Attempt to get existing wallet or create a new one (existing logic)
//       setWalletStatusMessage(
//         "Checking for existing wallet or creating a new one..."
//       );
//       const walletCreateResponse = await fetch(
//         "http://localhost:3001/api/wallet/create",
//         {
//           method: "POST",
//           headers: {
//             Authorization: `Bearer ${keycloak.token}`,
//             "Content-Type": "application/json",
//           },
//           body: JSON.stringify({}),
//         }
//       );

//       const walletData = await walletCreateResponse.json();
//       let currentPublicKey = null;

//       if (walletCreateResponse.ok) {
//         console.log("Wallet creation/fetch successful:", walletData);
//         currentPublicKey = walletData.wallet.public_key;
//         setWalletPublicKey(currentPublicKey);
//         setWalletCreated(true);
//         setWalletStatusMessage("Stellar wallet ready!");
//         setWalletError(null);
//       } else if (walletCreateResponse.status === 409) {
//         setWalletCreated(true);
//         setWalletStatusMessage("Stellar wallet already exists for this user.");
//         const walletMeResponse = await fetch(
//           "http://localhost:3001/api/wallet/me",
//           {
//             method: "GET",
//             headers: {
//               Authorization: `Bearer ${keycloak.token}`,
//               "Content-Type": "application/json",
//             },
//           }
//         );
//         const walletMeData = await walletMeResponse.json();
//         if (walletMeResponse.ok && walletMeData.wallet) {
//           currentPublicKey = walletMeData.wallet.public_key;
//           setWalletPublicKey(currentPublicKey);
//         } else {
//           console.error(
//             "Failed to fetch existing wallet:",
//             walletMeData.message
//           );
//           setWalletPublicKey("Error fetching existing key");
//           setWalletError(walletMeData.message);
//         }
//         setWalletError(null);
//       } else {
//         console.error("Error creating/fetching wallet:", walletData.message);
//         setWalletStatusMessage(`Error: ${walletData.message}`);
//         setWalletError(walletData.message);
//         setWalletCreated(false);
//       }

//       // 3. Fetch balances only if a public key is available (existing logic)
//       if (currentPublicKey) {
//         await fetchBalances(keycloak.token);
//         // 4. --- NEW: Fetch transaction history if a public key is available ---
//         await fetchTransactionHistory(keycloak.token);
//         // --- END NEW ---
//       } else {
//         setWalletStatusMessage(
//           "Could not determine public key to fetch balances and history."
//         );
//         setBalancesError("Could not determine public key to fetch balances.");
//         setBalancesLoading(false);
//         setHistoryError("Could not determine public key to fetch history.");
//         setHistoryLoading(false);
//       }
//     } catch (error) {
//       console.error(
//         "Network or unexpected error during post-login setup:",
//         error
//       );
//       setWalletStatusMessage(`Setup Error: ${error.message}`);
//       setWalletError(error.message);
//       setWalletCreated(false);
//       setBalancesLoading(false); // Stop loading if overall setup fails
//       setHistoryLoading(false); // Stop loading if overall setup fails
//     }
//   };
//   // --- END MODIFIED FUNCTION ---

//   // ... (existing fetchData and handleLogout functions) ...

//   const fetchData = async (endpoint, setMessage) => {
//     try {
//       const headers = {
//         "Content-Type": "application/json",
//       };
//       if (keycloak && keycloak.authenticated) {
//         headers["Authorization"] = `Bearer ${keycloak.token}`;
//       }

//       const response = await fetch(`http://localhost:3001${endpoint}`, {
//         headers,
//       });
//       if (!response.ok) {
//         if (response.status === 401) {
//           setMessage(`Access Denied: Not authenticated for ${endpoint}`);
//         } else if (response.status === 403) {
//           setMessage(
//             `Access Denied: Not authorized for ${endpoint} (missing role?)`
//           );
//         } else {
//           setMessage(`Error fetching ${endpoint}: ${response.statusText}`);
//         }
//         return;
//       }
//       const data = await response.json();
//       setMessage(data.message);
//     } catch (error) {
//       console.error(`Error fetching ${endpoint}:`, error);
//       setMessage(`Error fetching ${endpoint}: ${error.message}`);
//     }
//   };

//   const handleLogout = () => {
//     keycloak.logout();
//   };

//   return (
//     <>
//       <h1>Felix Platform</h1>
//       {keycloak && keycloak.authenticated ? (
//         <>
//           <p>Welcome, {username}!</p>
//           <p>Your Roles: {roles.join(", ")}</p>

//           <h2>Wallet Status:</h2>
//           <p>{walletStatusMessage}</p>
//           {walletPublicKey && (
//             <p>
//               Your Stellar Public Key: <code>{walletPublicKey}</code>
//             </p>
//           )}
//           {walletError && (
//             <p style={{ color: "red" }}>Wallet Error: {walletError}</p>
//           )}

//           <h2>Your Balances:</h2>
//           {balancesLoading ? (
//             <p>Loading balances...</p>
//           ) : balancesError ? (
//             <p style={{ color: "red" }}>
//               Error loading balances: {balancesError}
//             </p>
//           ) : stellarBalances.length > 0 ? (
//             <ul>
//               {stellarBalances.map((balance, index) => (
//                 <li key={index}>
//                   {balance.asset_code}:{" "}
//                   {parseFloat(balance.balance).toLocaleString()}
//                   {balance.asset_issuer && (
//                     <span style={{ fontSize: "0.8em", color: "#888" }}>
//                       {" "}
//                       (Issuer: {balance.asset_issuer.substring(0, 5)}...
//                       {balance.asset_issuer.substring(
//                         balance.asset_issuer.length - 5
//                       )}
//                       )
//                     </span>
//                   )}
//                 </li>
//               ))}
//             </ul>
//           ) : (
//             <p>
//               No balances found (account might be newly created or not funded).
//             </p>
//           )}

//           {/* --- NEW TRANSACTION HISTORY DISPLAY --- */}
//           <h2>Transaction History:</h2>
//           {historyLoading ? (
//             <p>Loading transaction history...</p>
//           ) : historyError ? (
//             <p style={{ color: "red" }}>
//               Error loading history: {historyError}
//             </p>
//           ) : transactionHistory.length > 0 ? (
//             <div className="transaction-list">
//               {transactionHistory.map((tx) => (
//                 <div key={tx.id} className="transaction-item">
//                   <p>
//                     <strong>Type:</strong> {tx.typeDescription}
//                   </p>
//                   <p>
//                     <strong>Date:</strong> {new Date(tx.date).toLocaleString()}
//                   </p>
//                   {tx.amount && tx.assetCode && (
//                     <p>
//                       <strong>Amount:</strong>{" "}
//                       {parseFloat(tx.amount).toLocaleString()} {tx.assetCode}
//                     </p>
//                   )}
//                   {tx.counterparty && (
//                     <p>
//                       <strong>Counterparty:</strong>{" "}
//                       <code style={{ fontSize: "0.8em" }}>
//                         {tx.counterparty.substring(0, 10)}...
//                         {tx.counterparty.substring(tx.counterparty.length - 10)}
//                       </code>
//                     </p>
//                   )}
//                   {tx.assetIssuer && (
//                     <p style={{ fontSize: "0.8em", color: "#666" }}>
//                       <strong>Issuer:</strong>{" "}
//                       <code style={{ fontSize: "0.8em" }}>
//                         {tx.assetIssuer.substring(0, 10)}...
//                         {tx.assetIssuer.substring(tx.assetIssuer.length - 10)}
//                       </code>
//                     </p>
//                   )}
//                   <p>
//                     <a
//                       href={`https://stellar.expert/explorer/testnet/tx/${tx.transactionHash}`}
//                       target="_blank"
//                       rel="noopener noreferrer"
//                     >
//                       View on Stellar Expert
//                     </a>
//                   </p>
//                   <hr />
//                 </div>
//               ))}
//             </div>
//           ) : (
//             <p>No transactions found for this account.</p>
//           )}
//           {/* --- END NEW TRANSACTION HISTORY DISPLAY --- */}

//           <h2>API Test Results:</h2>
//           <p>
//             <strong>Public Endpoint:</strong> {publicMessage}
//           </p>
//           <p>
//             <strong>Protected Endpoint:</strong> {protectedMessage}
//           </p>
//           <p>
//             <strong>Admin-Only Endpoint:</strong> {adminMessage}
//           </p>

//           <div className="card">
//             <button onClick={() => setCount((count) => count + 1)}>
//               count is {count}
//             </button>
//           </div>
//           <button onClick={handleLogout}>Logout</button>
//         </>
//       ) : (
//         <p>Loading authentication...</p>
//       )}
//     </>
//   );
// }

// export default App;

// // frontend/src/App.jsx
// import { useState, useEffect } from "react";
// import "./App.css"; // Keep your main App CSS
// import WalletDashboard from "./components/WalletDashboard"; // Import the new WalletDashboard component

// function App({ keycloak }) {
//   const [username, setUsername] = useState("Guest");
//   const [roles, setRoles] = useState([]);
//   const [protectedMessage, setProtectedMessage] = useState("");
//   const [adminMessage, setAdminMessage] = useState("");
//   const [publicMessage, setPublicMessage] = useState("");

//   // All wallet-related states (walletCreated, stellarBalances, transactionHistory, etc.)
//   // have been moved to WalletDashboard.jsx

//   useEffect(() => {
//     if (keycloak && keycloak.authenticated) {
//       setUsername(keycloak.tokenParsed.preferred_username || "User");
//       setRoles(keycloak.tokenParsed.realm_access.roles || []);

//       // Fetch protected data when authenticated
//       fetchData("/api/protected", setProtectedMessage);
//       fetchData("/api/admin-only", setAdminMessage); // Test admin-only route
//       // The handlePostLoginSetup (which fetches wallet info, balances, history)
//       // is now triggered inside WalletDashboard
//     }
//     fetchData("/api/public", setPublicMessage); // Fetch public data on mount
//   }, [keycloak]); // Re-run effect when keycloak object changes (e.g., after login)

//   // This fetchData function remains here as it's general for API test results
//   const fetchData = async (endpoint, setMessage) => {
//     try {
//       const headers = {
//         "Content-Type": "application/json",
//       };
//       if (keycloak && keycloak.authenticated) {
//         headers["Authorization"] = `Bearer ${keycloak.token}`;
//       }

//       const response = await fetch(`http://localhost:3001${endpoint}`, {
//         headers,
//       });
//       if (!response.ok) {
//         if (response.status === 401) {
//           setMessage(`Access Denied: Not authenticated for ${endpoint}`);
//         } else if (response.status === 403) {
//           setMessage(
//             `Access Denied: Not authorized for ${endpoint} (missing role?)`
//           );
//         } else {
//           setMessage(`Error fetching ${endpoint}: ${response.statusText}`);
//         }
//         return;
//       }
//       const data = await response.json();
//       setMessage(data.message);
//     } catch (error) {
//       console.error(`Error fetching ${endpoint}:`, error);
//       setMessage(`Error fetching ${endpoint}: ${error.message}`);
//     }
//   };

//   const handleLogout = () => {
//     keycloak.logout();
//   };

//   return (
//     <>
//       <h1>Felix Platform</h1>
//       {keycloak && keycloak.authenticated ? (
//         <>
//           <p>Welcome, {username}!</p>
//           <p>Your Roles: {roles.join(", ")}</p>

//           {/* Render the new WalletDashboard component here */}
//           <WalletDashboard keycloak={keycloak} />

//           {/* Existing API Test Results (can be moved later if needed, but fine here for now) */}
//           <h2>API Test Results:</h2>
//           <p>
//             <strong>Public Endpoint:</strong> {publicMessage}
//           </p>
//           <p>
//             <strong>Protected Endpoint:</strong> {protectedMessage}
//           </p>
//           <p>
//             <strong>Admin-Only Endpoint:</strong> {adminMessage}
//           </p>

//           <button onClick={handleLogout}>Logout</button>
//         </>
//       ) : (
//         <p>Loading authentication...</p>
//       )}
//     </>
//   );
// }

// export default App;

// frontend/src/App.jsx
// frontend/src/App.jsx
// import React, { useState, useEffect } from "react";
// import { Routes, Route, Link, Navigate } from "react-router-dom";
// import WalletDashboard from "./components/WalletDashboard";
// import DexOffers from "./components/DexOffers";
// import ServiceManagement from "./components/ServiceManagement"; // Import ServiceManagement
// import ServiceCatalog from "./components/ServiceCatalog";

// import "./App.css";

// function App({ keycloak }) {
//   const [username, setUsername] = useState("Guest");
//   const [roles, setRoles] = useState([]);
//   const [publicMessage, setPublicMessage] = useState("");
//   const [protectedMessage, setProtectedMessage] = useState("");
//   const [adminMessage, setAdminMessage] = useState("");

//   useEffect(() => {
//     if (keycloak && keycloak.authenticated) {
//       setUsername(keycloak.tokenParsed.name || "User");
//       // Ensure realm_access exists before trying to access roles
//       setRoles(keycloak.tokenParsed.realm_access?.roles || []);
//       fetchData("/api/protected", setProtectedMessage);
//       // Removed /api/admin-only fetch as its role check is now inline in ServiceManagement
//       // and this endpoint is likely for a different 'admin' role, not 'super-admin' or 'entity_owner'
//       // If you still need to test this specific /api/admin-only endpoint for an 'admin' role, keep it.
//       // For now, assuming it's not directly related to ServiceManagement access.
//     }
//     fetchData("/api/public", setPublicMessage);
//   }, [keycloak]);

//   const fetchData = async (endpoint, setMessage) => {
//     try {
//       const headers = {
//         "Content-Type": "application/json",
//       };
//       if (keycloak && keycloak.authenticated) {
//         headers["Authorization"] = `Bearer ${keycloak.token}`;
//       }

//       const response = await fetch(`http://localhost:3001${endpoint}`, {
//         headers,
//       });

//       if (!response.ok) {
//         if (response.status === 401) {
//           setMessage(`Authentication Required for ${endpoint}`);
//         } else if (response.status === 403) {
//           setMessage(
//             `Access Denied: Not authorized for ${endpoint} (missing role?)`
//           );
//         } else {
//           setMessage(`Error fetching ${endpoint}: ${response.statusText}`);
//         }
//         return;
//       }
//       const data = await response.json();
//       setMessage(data.message);
//     } catch (error) {
//       console.error(`Error fetching ${endpoint}:`, error);
//       setMessage(`Error fetching ${endpoint}: ${error.message}`);
//     }
//   };

//   const handleLogout = () => {
//     keycloak.logout();
//   };

//   return (
//     <div className="app-container">
//       {keycloak && keycloak.authenticated ? (
//         <>
//           <aside className="sidebar">
//             <h2>Felix Platform</h2>

//             <h2 style={{ lineHeight: "1.2" }}>
//               Welcome,
//               <br />
//               {username}!
//             </h2>

//             {/* <p>Roles: {roles.join(", ")}</p> */}

//             <nav>
//               <ul>
//                 <li>
//                   <Link to="/wallet">💼 Wallet</Link>
//                 </li>
//                 <li>
//                   <Link to="/dex-offers">🔁 DEX Offers</Link>
//                 </li>
//                 {/* Conditional link for Service Management based on entity_owner role */}
//                 {roles.includes("entity_owner") && (
//                   <li>
//                     <Link to="/services">🛠️ Service Management</Link>
//                   </li>
//                 )}
//                 <li>
//                   <Link to="/catalog">🛒 Service Catalog</Link>
//                 </li>
//                 {/* Keep existing admin link if 'admin' is a separate role for a different dashboard */}
//                 {roles.includes("admin") && (
//                   <li>
//                     <Link to="/admin">🧑‍💼 Admin Dashboard</Link>
//                   </li>
//                 )}
//                 <li>
//                   <button onClick={handleLogout} className="logout-button">
//                     Logout
//                   </button>
//                 </li>
//               </ul>
//             </nav>
//             <div className="api-test-results">
//               {/* <h3>API Tests:</h3>
//               <p>
//                 <strong>Public:</strong> {publicMessage}
//               </p>
//               <p>
//                 <strong>Protected:</strong> {protectedMessage}
//               </p> */}
//               {/* Only show admin message if the 'admin' role is relevant for this UI */}
//               {roles.includes("admin") && (
//                 <p>
//                   <strong>Admin:</strong> {adminMessage}
//                 </p>
//               )}
//             </div>
//           </aside>

//           <main className="main-content">
//             <Routes>
//               <Route path="/" element={<Navigate to="/wallet" />} />
//               <Route
//                 path="/wallet"
//                 element={<WalletDashboard keycloak={keycloak} />}
//               />
//               <Route
//                 path="/dex-offers"
//                 element={<DexOffers keycloak={keycloak} />}
//               />
//               {/* Route for Service Management */}
//               <Route
//                 path="/services"
//                 element={<ServiceManagement keycloak={keycloak} />}
//               />
//               {/* Route for Service Catalog */}
//               <Route
//                 path="/catalog"
//                 element={<ServiceCatalog keycloak={keycloak} />}
//               />
//               <Route
//                 path="/admin"
//                 element={
//                   roles.includes("admin") ? (
//                     <div>
//                       <h3>Admin Dashboard (Dummy)</h3>
//                       <p>This is a placeholder for admin functionalities.</p>
//                       <p>Only users with the 'admin' role can see this page.</p>
//                     </div>
//                   ) : (
//                     <p className="error-message">
//                       Access Denied. You do not have admin privileges to view
//                       this page.
//                     </p>
//                   )
//                 }
//               />
//               <Route
//                 path="*"
//                 element={
//                   <div>
//                     <h3>404 - Page Not Found</h3>
//                     <p>The page you are looking for does not exist.</p>
//                   </div>
//                 }
//               />
//             </Routes>
//           </main>
//         </>
//       ) : (
//         <div className="loading-container">
//           <p>Loading authentication... Please wait or log in.</p>
//         </div>
//       )}
//     </div>
//   );
// }

// export default App;

// frontend/src/App.jsx
import React, { useState, useEffect } from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom";
import WalletDashboard from "./components/WalletDashboard";
import DexOffers from "./components/DexOffers";
import ServiceManagement from "./components/ServiceManagement";
import ServiceCatalog from "./components/ServiceCatalog";
import "./App.css";

function App({ keycloak }) {
  const [username, setUsername] = useState("Guest");
  const [roles, setRoles] = useState([]);
  const [publicMessage, setPublicMessage] = useState("");
  const [protectedMessage, setProtectedMessage] = useState("");
  const [adminMessage, setAdminMessage] = useState("");

  useEffect(() => {
    if (keycloak && keycloak.authenticated) {
      setUsername(keycloak.tokenParsed.name || "User");
      setRoles(keycloak.tokenParsed.realm_access?.roles || []);
      fetchData("/api/protected", setProtectedMessage);
    }
    fetchData("/api/public", setPublicMessage);
  }, [keycloak]);

  const fetchData = async (endpoint, setMessage) => {
    try {
      const headers = {
        "Content-Type": "application/json",
      };
      if (keycloak && keycloak.authenticated) {
        headers["Authorization"] = `Bearer ${keycloak.token}`;
      }

      const response = await fetch(`http://localhost:3001${endpoint}`, {
        headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          setMessage(`Authentication Required for ${endpoint}`);
        } else if (response.status === 403) {
          setMessage(
            `Access Denied: Not authorized for ${endpoint} (missing role?)`
          );
        } else {
          setMessage(`Error fetching ${endpoint}: ${response.statusText}`);
        }
        return;
      }
      const data = await response.json();
      setMessage(data.message);
    } catch (error) {
      console.error(`Error fetching ${endpoint}:`, error);
      setMessage(`Error fetching ${endpoint}: ${error.message}`);
    }
  };

  const handleLogout = () => {
    keycloak.logout();
  };

  return (
    <div className="app-container">
      {keycloak && keycloak.authenticated ? (
        <>
          <aside className="sidebar">
            {/* Felix Platform with larger size and gradient divider */}
            <div className="sidebar-header">
              <div className="platform-icon">F</div>
              <h1 className="platform-title">Felix</h1>
              <div className="gradient-divider"></div>
            </div>

            {/* Welcome section with gradient divider */}
            <div className="welcome-section">
              <h2 className="welcome-message">
                Welcome,
                <br />
                {username}!
              </h2>
              <div className="gradient-divider"></div>
            </div>

            <nav>
              <ul>
                <li>
                  <Link to="/wallet">💼 Wallet</Link>
                </li>
                <li>
                  <Link to="/dex-offers">🔁 DEX Offers</Link>
                </li>
                {roles.includes("entity_owner") && (
                  <li>
                    <Link to="/services">🛠️ Service Management</Link>
                  </li>
                )}
                <li>
                  <Link to="/catalog">🛒 Service Catalog</Link>
                </li>
                {roles.includes("admin") && (
                  <li>
                    <Link to="/admin">🧑‍💼 Admin Dashboard</Link>
                  </li>
                )}
              </ul>
            </nav>

            {/* API test results moved up */}
            <div className="api-test-results">
              {roles.includes("admin") && (
                <p>
                  <strong>Admin:</strong> {adminMessage}
                </p>
              )}
            </div>

            {/* Logout button at the bottom */}
            <div className="logout-section">
              <button onClick={handleLogout} className="logout-button">
                Logout
              </button>
              <div className="gradient-divider"></div>
            </div>
          </aside>

          <main className="main-content">
            <Routes>
              <Route path="/" element={<Navigate to="/wallet" />} />
              <Route
                path="/wallet"
                element={<WalletDashboard keycloak={keycloak} />}
              />
              <Route
                path="/dex-offers"
                element={<DexOffers keycloak={keycloak} />}
              />
              <Route
                path="/services"
                element={<ServiceManagement keycloak={keycloak} />}
              />
              <Route
                path="/catalog"
                element={<ServiceCatalog keycloak={keycloak} />}
              />
              <Route
                path="/admin"
                element={
                  roles.includes("admin") ? (
                    <div>
                      <h3>Admin Dashboard (Dummy)</h3>
                      <p>This is a placeholder for admin functionalities.</p>
                      <p>Only users with the 'admin' role can see this page.</p>
                    </div>
                  ) : (
                    <p className="error-message">
                      Access Denied. You do not have admin privileges to view
                      this page.
                    </p>
                  )
                }
              />
              <Route
                path="*"
                element={
                  <div>
                    <h3>404 - Page Not Found</h3>
                    <p>The page you are looking for does not exist.</p>
                  </div>
                }
              />
            </Routes>
          </main>
        </>
      ) : (
        <div className="loading-container">
          <p>Loading authentication... Please wait or log in.</p>
        </div>
      )}
    </div>
  );
}

export default App;
