// frontend/src/components/DexOffers.jsx
import React, { useState, useEffect } from "react";
import "./DexOffers.css"; // We'll create this CSS file next

const DexOffers = ({ keycloak }) => {
  // State for the Create Offer form
  const [sellingAssetCode, setSellingAssetCode] = useState("BLUEDOLLAR");
  const [sellingAssetIssuer, setSellingAssetIssuer] = useState(""); // This might be auto-filled or derived later
  const [buyingAssetCode, setBuyingAssetCode] = useState("XLM");
  const [buyingAssetIssuer, setBuyingAssetIssuer] = useState(""); // This might be auto-filled or derived later
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");

  const [createOfferLoading, setCreateOfferLoading] = useState(false);
  const [createOfferSuccess, setCreateOfferSuccess] = useState(null);
  const [createOfferError, setCreateOfferError] = useState(null);

  const [cancelOfferLoading, setCancelOfferLoading] = useState(false);
  const [cancelOfferMessage, setCancelOfferMessage] = useState(null);

  // State for Active Offers (for future implementation - placeholder for now)
  const [activeOffers, setActiveOffers] = useState([]);
  const [activeOffersLoading, setActiveOffersLoading] = useState(true);
  const [activeOffersError, setActiveOffersError] = useState(null);

  // --- Helper function to determine issuer based on asset code ---
  // In a real app, you'd fetch this from a configuration or from the backend
  const getIssuerForAsset = (assetCode) => {
    // This should match the BLUEDOLLAR_ISSUER_PUBLIC_KEY in your backend's .env
    const blueDollarIssuer =
      "GAD2R35CGPLY3TKI2FYQDTD3IMYXWXZEVUNTJVTFHKPHM6CSYMGSVAU4"; // REPLACE WITH YOUR ACTUAL BLUEDOLLAR_ISSUER_PUBLIC_KEY
    if (assetCode === "BLUEDOLLAR") {
      return blueDollarIssuer;
    }
    // For XLM, no issuer is needed. For other custom assets, you'd add their issuers here.
    return "";
  };

  const handleCancelOffer = async (offerId, sellingAsset, buyingAsset) => {
    if (!keycloak.authenticated) {
      setCancelOfferMessage("Please log in to cancel offers.");
      return;
    }

    if (
      !window.confirm(`Are you sure you want to cancel offer ID ${offerId}?`)
    ) {
      return; // User cancelled confirmation
    }

    setCancelOfferLoading(true);
    setCancelOfferMessage(null); // Clear previous messages
    try {
      const response = await fetch(
        "http://localhost:3001/api/dex/cancel-offer",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${keycloak.token}`,
          },
          body: JSON.stringify({
            offerId: offerId,
            sellingAssetCode: sellingAsset.code,
            sellingAssetIssuer: sellingAsset.issuer,
            buyingAssetCode: buyingAsset.code,
            buyingAssetIssuer: buyingAsset.issuer,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setCancelOfferMessage(
          `Offer ${offerId} cancelled successfully! Refreshing offers...`
        );
        // Refresh the list of active offers after successful cancellation
        fetchActiveOffers();
      } else {
        setCancelOfferMessage(
          `Failed to cancel offer ${offerId}: ${data.message}`
        );
        console.error("Error cancelling offer:", data.message);
      }
    } catch (error) {
      setCancelOfferMessage(
        `Network error while cancelling offer: ${error.message}`
      );
      console.error("Network error cancelling offer:", error);
    } finally {
      setCancelOfferLoading(false);
    }
  };
  // --- Effect to set default issuers when asset codes change ---
  useEffect(() => {
    setSellingAssetIssuer(getIssuerForAsset(sellingAssetCode));
  }, [sellingAssetCode]);

  useEffect(() => {
    setBuyingAssetIssuer(getIssuerForAsset(buyingAssetCode));
  }, [buyingAssetCode]);

  // --- Handle Create Offer Submission ---
  const handleCreateOffer = async (e) => {
    e.preventDefault();
    setCreateOfferLoading(true);
    setCreateOfferSuccess(null);
    setCreateOfferError(null);

    if (!keycloak || !keycloak.authenticated || !keycloak.token) {
      setCreateOfferError("Authentication required to create an offer.");
      setCreateOfferLoading(false);
      return;
    }

    try {
      const response = await fetch(
        "http://localhost:3001/api/dex/create-offer",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sellingAssetCode,
            sellingAssetIssuer:
              sellingAssetCode === "XLM" ? undefined : sellingAssetIssuer,
            buyingAssetCode,
            buyingAssetIssuer:
              buyingAssetCode === "XLM" ? undefined : buyingAssetIssuer,
            amount: parseFloat(amount).toFixed(7), // Ensure Stellar precision
            price: parseFloat(price).toString(), // Price can have more decimals, but string is fine
          }),
        }
      );

      const data = await response.json();
      if (response.ok) {
        setCreateOfferSuccess(data.message || "Offer created successfully!");
        // Clear form
        setAmount("");
        setPrice("");
        // Potentially refresh active offers list here if implemented
      } else {
        setCreateOfferError(data.message || "Failed to create offer.");
        console.error("Error creating offer:", data.message);
      }
    } catch (error) {
      setCreateOfferError(
        error.message || "Network error while creating offer."
      );
      console.error("Network error creating offer:", error);
    } finally {
      setCreateOfferLoading(false);
    }
  };

  // --- Placeholder for Fetching Active Offers (to be implemented later) ---
  useEffect(() => {
    const fetchActiveOffers = async () => {
      if (!keycloak || !keycloak.authenticated || !keycloak.token) {
        setActiveOffersError("Authentication required to view active offers.");
        setActiveOffersLoading(false);
        return;
      }

      setActiveOffersLoading(true);
      setActiveOffersError(null);
      try {
        const response = await fetch(
          "http://localhost:3001/api/dex/my-offers",
          {
            headers: {
              Authorization: `Bearer ${keycloak.token}`,
            },
          }
        );

        const data = await response.json();
        if (response.ok) {
          setActiveOffers(data.offers);
        } else {
          setActiveOffersError(
            data.message || "Failed to fetch active offers."
          );
          console.error("Error fetching active offers:", data.message);
        }
      } catch (error) {
        setActiveOffersError(
          error.message || "Network error while fetching active offers."
        );
        console.error("Network error fetching active offers:", error);
      } finally {
        setActiveOffersLoading(false);
      }
    };

    if (keycloak && keycloak.authenticated) {
      fetchActiveOffers();
    }
    // Dependency array: re-run when keycloak.token changes (login/logout)
  }, [keycloak, createOfferSuccess]);

  return (
    <div className="dex-offers-dashboard">
      <h2>DEX Offers</h2>

      {/* Create Offer Section */}
      <div className="create-offer-card">
        <h3>Create New Offer</h3>
        <form onSubmit={handleCreateOffer}>
          {/* Selling Asset */}
          <div className="form-group">
            <label htmlFor="sellingAssetCode">Selling Asset:</label>
            <select
              id="sellingAssetCode"
              value={sellingAssetCode}
              onChange={(e) => setSellingAssetCode(e.target.value)}
              required
            >
              <option value="BLUEDOLLAR">BLUEDOLLAR</option>
              <option value="XLM">XLM</option>
              {/* Add more options as needed, potentially dynamically from user balances */}
            </select>
          </div>
          {/* Buying Asset */}
          <div className="form-group">
            <label htmlFor="buyingAssetCode">Buying Asset:</label>
            <select
              id="buyingAssetCode"
              value={buyingAssetCode}
              onChange={(e) => setBuyingAssetCode(e.target.value)}
              required
            >
              <option value="XLM">XLM</option>
              <option value="BLUEDOLLAR">BLUEDOLLAR</option>
              {/* Add more options as needed */}
            </select>
          </div>

          {/* Amount to Sell */}
          <div className="form-group">
            <label htmlFor="amount">Amount to Sell:</label>
            <input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Amount of ${sellingAssetCode}`}
              step="0.0000001"
              min="0.0000001"
              required
            />
          </div>

          {/* Price (Buying Asset per Selling Asset) */}
          <div className="form-group">
            <label htmlFor="price">
              Price ({buyingAssetCode} per {sellingAssetCode}):
            </label>
            <input
              type="number"
              id="price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={`Price in ${buyingAssetCode}`}
              step="0.0000001"
              min="0.0000001"
              required
            />
          </div>

          <button
            type="submit"
            className="create-offer-button"
            disabled={createOfferLoading}
          >
            {createOfferLoading ? "Creating Offer..." : "Create Offer"}
          </button>

          {createOfferSuccess && (
            <p className="success-message">{createOfferSuccess}</p>
          )}
          {createOfferError && (
            <p className="error-message">{createOfferError}</p>
          )}
        </form>
      </div>

      {/* Active Offers Section */}
      <div className="active-offers-card">
        <h3>My Active Offers</h3>
        {activeOffersLoading ? (
          <p>Loading active offers...</p>
        ) : activeOffersError ? (
          <p className="error-message">
            Error loading offers: {activeOffersError}
          </p>
        ) : activeOffers.length > 0 ? (
          <ul>
            {activeOffers.map((offer) => (
              <li key={offer.id}>
                Offer ID: {offer.id} <br />
                Selling: {offer.amount} {offer.sellingAsset.code}{" "}
                {offer.sellingAsset.issuer
                  ? `(${offer.sellingAsset.issuer.substring(0, 5)}...)`
                  : ""}{" "}
                <br />
                Buying: {offer.price} {offer.buyingAsset.code}{" "}
                {offer.buyingAsset.issuer
                  ? `(${offer.buyingAsset.issuer.substring(0, 5)}...)`
                  : ""}{" "}
                <br />
                Price: {offer.price} {offer.buyingAsset.code} per{" "}
                {offer.sellingAsset.code} <br />
                <small>
                  Last Modified:{" "}
                  {new Date(offer.lastModifiedTime).toLocaleString()}
                </small>
                <br />
                <button
                  className="cancel-offer-button"
                  onClick={() =>
                    handleCancelOffer(
                      offer.id,
                      offer.sellingAsset,
                      offer.buyingAsset
                    )
                  }
                  disabled={cancelOfferLoading}
                >
                  {cancelOfferLoading ? "Cancelling..." : "Cancel Offer"}
                </button>
                {/* Add a button here for cancelling offers in a future step */}
              </li>
            ))}
          </ul>
        ) : (
          <p>No active offers found.</p>
        )}
        {/* Removed the old placeholder note */}
      </div>
    </div>
  );
};

export default DexOffers;
