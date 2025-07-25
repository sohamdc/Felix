// frontend/src/components/WalletDashboard.jsx
import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react"; // NEW: Import QRCodeSVG
import "./WalletDashboard.css";

const WalletDashboard = ({ keycloak }) => {
  // --- WALLET MANAGEMENT STATE ---
  const [walletCreated, setWalletCreated] = useState(false);
  const [walletPublicKey, setWalletPublicKey] = useState(null);
  const [walletError, setWalletError] = useState(null);
  const [walletStatusMessage, setWalletStatusMessage] = useState(
    "Checking wallet status..."
  );

  // --- BALANCES STATE ---
  const [stellarBalances, setStellarBalances] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [balancesError, setBalancesError] = useState(null);

  // --- TRANSACTION HISTORY STATE ---
  const [transactionHistory, setTransactionHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);

  // --- SEND ASSET FORM STATE ---
  const [destinationPublicKey, setDestinationPublicKey] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendAssetCode, setSendAssetCode] = useState("BLUEDOLLAR"); // Default to BLUEDOLLAR
  const [memo, setMemo] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [sendSuccessMessage, setSendSuccessMessage] = useState(null);
  const [sendErrorMessage, setSendErrorMessage] = useState(null);

  // --- NEW: RECEIVE ASSET STATE ---
  const [copyFeedback, setCopyFeedback] = useState(""); // State for copy message
  // --- END NEW: RECEIVE ASSET STATE ---

  // --- Existing Function: Fetch Stellar Balances ---
  const fetchBalances = async (token) => {
    setBalancesLoading(true);
    setBalancesError(null);
    try {
      const response = await fetch(
        "http://localhost:3001/api/wallet/balances",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();
      if (response.ok) {
        setStellarBalances(data.balances);
        console.log("Stellar Balances:", data.balances);
      } else {
        setBalancesError(data.message || "Failed to fetch balances.");
        console.error("Error fetching balances:", data.message);
      }
    } catch (error) {
      setBalancesError(error.message || "Network error fetching balances.");
      console.error("Network error fetching balances:", error);
    } finally {
      setBalancesLoading(false);
    }
  };

  // --- Existing Function: Fetch Transaction History ---
  const fetchTransactionHistory = async (token) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch(
        "http://localhost:3001/api/wallet/transactions",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();
      if (response.ok) {
        setTransactionHistory(data.transactions);
        console.log("Transaction History:", data.transactions);
      } else {
        setHistoryError(data.message || "Failed to fetch transaction history.");
        console.error("Error fetching transaction history:", data.message);
      }
    } catch (error) {
      setHistoryError(
        error.message || "Network error fetching transaction history."
      );
      console.error("Network error fetching transaction history:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  // --- Modified Function: handlePostLoginSetup ---
  const handlePostLoginSetup = async () => {
    if (!keycloak || !keycloak.authenticated || !keycloak.token) {
      return;
    }

    try {
      setWalletStatusMessage("Syncing user data...");
      const syncResponse = await fetch("http://localhost:3001/api/user/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${keycloak.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const syncData = await syncResponse.json();
      if (!syncResponse.ok) {
        console.error("Error syncing user:", syncData.message);
        setWalletStatusMessage(`Error syncing user: ${syncData.message}`);
        setWalletError(syncData.message);
        return;
      }
      console.log("User sync response:", syncData.message);

      setWalletStatusMessage(
        "Checking for existing wallet or creating a new one..."
      );
      const walletCreateResponse = await fetch(
        "http://localhost:3001/api/wallet/create",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      const walletData = await walletCreateResponse.json();
      let currentPublicKey = null;

      if (walletCreateResponse.ok) {
        console.log("Wallet creation/fetch successful:", walletData);
        currentPublicKey = walletData.wallet.public_key;
        setWalletPublicKey(currentPublicKey);
        setWalletCreated(true);
        setWalletStatusMessage("Stellar wallet ready!");
        setWalletError(null);
      } else if (walletCreateResponse.status === 409) {
        setWalletCreated(true);
        setWalletStatusMessage("Stellar wallet already exists for this user.");
        const walletMeResponse = await fetch(
          "http://localhost:3001/api/wallet/me",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${keycloak.token}`,
              "Content-Type": "application/json",
            },
          }
        );
        const walletMeData = await walletMeResponse.json();
        if (walletMeResponse.ok && walletMeData.wallet) {
          currentPublicKey = walletMeData.wallet.public_key;
          setWalletPublicKey(currentPublicKey);
        } else {
          console.error(
            "Failed to fetch existing wallet:",
            walletMeData.message
          );
          setWalletPublicKey("Error fetching existing key");
          setWalletError(walletMeData.message);
        }
        setWalletError(null);
      } else {
        console.error("Error creating/fetching wallet:", walletData.message);
        setWalletStatusMessage(`Error: ${walletData.message}`);
        setWalletError(walletData.message);
        setWalletCreated(false);
      }

      if (currentPublicKey) {
        await fetchBalances(keycloak.token);
        await fetchTransactionHistory(keycloak.token);
      } else {
        setWalletStatusMessage(
          "Could not determine public key to fetch balances and history."
        );
        setBalancesError("Could not determine public key to fetch balances.");
        setBalancesLoading(false);
        setHistoryError("Could not determine public key to fetch history.");
        setHistoryLoading(false);
      }
    } catch (error) {
      console.error(
        "Network or unexpected error during post-login setup:",
        error
      );
      setWalletStatusMessage(`Setup Error: ${error.message}`);
      setWalletError(error.message);
      setWalletCreated(false);
      setBalancesLoading(false);
      setHistoryLoading(false);
    }
  };

  // --- Handle Send Asset ---
  const handleSendAsset = async (e) => {
    e.preventDefault();
    setSendLoading(true);
    setSendSuccessMessage(null);
    setSendErrorMessage(null);

    if (!destinationPublicKey || !sendAmount || parseFloat(sendAmount) <= 0) {
      setSendErrorMessage(
        "Please enter a valid destination public key and a positive amount."
      );
      setSendLoading(false);
      return;
    }
    if (!sendAssetCode) {
      setSendErrorMessage("Please select an asset to send.");
      setSendLoading(false);
      return;
    }

    try {
      const response = await fetch(
        "http://localhost:3001/api/wallet/send-asset",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            destinationPublicKey,
            amount: parseFloat(sendAmount).toFixed(7),
            assetCode: sendAssetCode,
            memo: memo || undefined,
          }),
        }
      );

      const data = await response.json();
      if (response.ok) {
        setSendSuccessMessage(data.message || "Asset sent successfully!");
        setDestinationPublicKey("");
        setSendAmount("");
        setMemo("");
        await fetchBalances(keycloak.token);
        await fetchTransactionHistory(keycloak.token);
      } else {
        setSendErrorMessage(data.message || "Failed to send asset.");
        console.error("Error sending asset:", data.message);
      }
    } catch (error) {
      setSendErrorMessage(
        error.message || "Network error while sending asset."
      );
      console.error("Network error sending asset:", error);
    } finally {
      setSendLoading(false);
    }
  };

  // --- NEW: Handle Copy Public Key ---
  const handleCopyPublicKey = async () => {
    if (walletPublicKey) {
      try {
        await navigator.clipboard.writeText(walletPublicKey);
        setCopyFeedback("Copied!");
        setTimeout(() => setCopyFeedback(""), 2000); // Clear feedback after 2 seconds
      } catch (err) {
        setCopyFeedback("Failed to copy.");
        console.error("Failed to copy public key:", err);
      }
    }
  };

  useEffect(() => {
    if (keycloak && keycloak.authenticated) {
      handlePostLoginSetup();
    }
  }, [keycloak]);

  return (
    <div className="wallet-dashboard">
      <h2>Your Wallet</h2>

      {/* Wallet Status Section */}
      <div className="wallet-status-card">
        <h3>Wallet Status:</h3>
        <p>{walletStatusMessage}</p>
        {walletPublicKey && (
          <p>
            Your Stellar Public Key: <code>{walletPublicKey}</code>
          </p>
        )}
        {walletError && (
          <p className="error-message">Wallet Error: {walletError}</p>
        )}
      </div>

      {/* Balances Section */}
      <div className="balances-card">
        <h3>Your Balances:</h3>
        {balancesLoading ? (
          <p>Loading balances...</p>
        ) : balancesError ? (
          <p className="error-message">
            Error loading balances: {balancesError}
          </p>
        ) : stellarBalances.length > 0 ? (
          <ul>
            {stellarBalances.map((balance, index) => (
              <li key={index}>
                {balance.asset_code}:{" "}
                {parseFloat(balance.balance).toLocaleString()}
                {balance.asset_issuer && (
                  <span style={{ fontSize: "0.8em", color: "#888" }}>
                    {" "}
                    (Issuer: {balance.asset_issuer.substring(0, 5)}...
                    {balance.asset_issuer.substring(
                      balance.asset_issuer.length - 5
                    )}
                    )
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            No balances found (account might be newly created or not funded).
          </p>
        )}
      </div>

      {/* NEW: Receive Assets Section */}
      <div className="receive-asset-card">
        <h3>Receive Assets</h3>
        {walletPublicKey ? (
          <>
            <p>Share your public key to receive assets:</p>
            <div className="public-key-display">
              <code className="public-key-code">{walletPublicKey}</code>
              <button onClick={handleCopyPublicKey} className="copy-button">
                {copyFeedback || "Copy"}
              </button>
            </div>
            {walletPublicKey && (
              <div className="qr-code-container">
                <p>Scan QR Code:</p>
                {/* Use 'value' prop for the data to encode */}
                <QRCodeSVG value={walletPublicKey} size={150} level="H" />
              </div>
            )}
            <p className="receive-note">
              **Note:** To receive non-XLM assets (like BLUEDOLLAR), your wallet
              must first establish a Trustline for that asset. This is typically
              done automatically when you send any non-XLM asset from your
              wallet. If you receive an asset you don't have a trustline for,
              the transaction might fail or the sender might need to pay the
              trustline fee.
            </p>
          </>
        ) : (
          <p>Your public key is not available yet.</p>
        )}
      </div>

      {/* Send Asset Section */}
      <div className="send-asset-card">
        <h3>Send Assets</h3>
        <form onSubmit={handleSendAsset}>
          <div className="form-group">
            <label htmlFor="destinationPublicKey">Recipient Public Key:</label>
            <input
              type="text"
              id="destinationPublicKey"
              value={destinationPublicKey}
              onChange={(e) => setDestinationPublicKey(e.target.value)}
              placeholder="e.g., GC...XYZ"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="sendAmount">Amount:</label>
            <input
              type="number"
              id="sendAmount"
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
              placeholder="e.g., 100"
              step="0.0000001"
              min="0.0000001"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="sendAssetCode">Asset:</label>
            <select
              id="sendAssetCode"
              value={sendAssetCode}
              onChange={(e) => setSendAssetCode(e.target.value)}
              required
            >
              <option value="BLUEDOLLAR">BLUEDOLLAR</option>
              <option value="XLM">XLM</option>
              {/* Future: Dynamically list assets user has trustlines for */}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="memo">Memo (Optional):</label>
            <input
              type="text"
              id="memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="e.g., Payment for services"
              maxLength="28"
            />
          </div>

          <button type="submit" className="send-button" disabled={sendLoading}>
            {sendLoading ? "Sending..." : "Send Asset"}
          </button>

          {sendSuccessMessage && (
            <p className="success-message">{sendSuccessMessage}</p>
          )}
          {sendErrorMessage && (
            <p className="error-message">{sendErrorMessage}</p>
          )}
        </form>
      </div>

      {/* Transaction History Section */}
      <div className="transaction-history-card">
        <h3>Transaction History:</h3>
        {historyLoading ? (
          <p>Loading transaction history...</p>
        ) : historyError ? (
          <p className="error-message">Error loading history: {historyError}</p>
        ) : transactionHistory.length > 0 ? (
          <div className="transaction-list">
            {transactionHistory.map((tx) => (
              <div key={tx.id} className="transaction-item">
                <p>
                  <strong>Type:</strong> {tx.typeDescription}
                </p>
                <p>
                  <strong>Date:</strong> {new Date(tx.date).toLocaleString()}
                </p>
                {tx.amount && tx.assetCode && (
                  <p>
                    <strong>Amount:</strong>{" "}
                    {parseFloat(tx.amount).toLocaleString()} {tx.assetCode}
                  </p>
                )}
                {tx.counterparty && (
                  <p>
                    <strong>Counterparty:</strong>{" "}
                    <code style={{ fontSize: "0.8em" }}>
                      {tx.counterparty.substring(0, 10)}...
                      {tx.counterparty.substring(tx.counterparty.length - 10)}
                    </code>
                  </p>
                )}
                {tx.assetIssuer && (
                  <p style={{ fontSize: "0.8em", color: "#666" }}>
                    <strong>Issuer:</strong>{" "}
                    <code style={{ fontSize: "0.8em" }}>
                      {tx.assetIssuer.substring(0, 10)}...
                      {tx.assetIssuer.substring(tx.assetIssuer.length - 10)}
                    </code>
                  </p>
                )}
                {tx.memo && (
                  <p>
                    <strong>Memo:</strong> {tx.memo}
                  </p>
                )}
                <p>
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${tx.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on Stellar Expert
                  </a>
                </p>
                <hr />
              </div>
            ))}
          </div>
        ) : (
          <p>No transactions found for this account.</p>
        )}
      </div>
    </div>
  );
};

export default WalletDashboard;
