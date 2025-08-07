// frontend/src/components/ServiceCatalog.jsx
import React, { useState, useEffect } from "react";
import "./ServiceCatalog.css";

const ServiceCatalog = ({ keycloak }) => {
  const [activeTab, setActiveTab] = useState("available");
  const [services, setServices] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [debugMode, setDebugMode] = useState(false); // unused
  const [debugMode1, setDebugMode1] = useState(false); // unused
  const [debugMode1, setDebugMode1] = useState(false); // unused

  const [loading, setLoading] = useState({
    services: true,
    purchases: true,
  });
  const [error, setError] = useState({
    services: null,
    purchases: null,
  });

  // State for purchase functionality
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState(null);
  const [buyQuantity, setBuyQuantity] = useState(1);
  const [buyingService, setBuyingService] = useState(null);

  const fetchServices = async () => {
    if (!keycloak.authenticated) {
      setLoading((prev) => ({ ...prev, services: false }));
      setError((prev) => ({
        ...prev,
        services: "Please log in to view services.",
      }));
      return;
    }

    setLoading((prev) => ({ ...prev, services: true }));
    setError((prev) => ({ ...prev, services: null }));
    try {
      const response = await fetch(
        "http://localhost:3001/api/public-services",
        {
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
          },
        }
      );
      const data = await response.json();

      if (response.ok) {
        setServices(data);
      } else {
        setError((prev) => ({
          ...prev,
          services: data.message || "Failed to fetch services.",
        }));
      }
    } catch (err) {
      console.error("Error fetching services:", err);
      setError((prev) => ({
        ...prev,
        services: "Network error or failed to connect to the server.",
      }));
    } finally {
      setLoading((prev) => ({ ...prev, services: false }));
    }
  };

  const fetchPurchases = async () => {
    if (!keycloak || !keycloak.authenticated || !keycloak.token) {
      setLoading((prev) => ({ ...prev, purchases: false }));
      setError((prev) => ({
        ...prev,
        purchases: "Authentication required to view purchases.",
      }));
      return;
    }

    setLoading((prev) => ({ ...prev, purchases: true }));
    setError((prev) => ({ ...prev, purchases: null }));
    try {
      const response = await fetch("http://localhost:3001/api/purchases/me", {
        headers: {
          Authorization: `Bearer ${keycloak.token}`,
        },
      });
      const data = await response.json();

      if (response.ok) {
        setPurchases(data.purchases);
      } else {
        setError((prev) => ({
          ...prev,
          purchases: data.message || "Failed to fetch purchases.",
        }));
      }
    } catch (err) {
      console.error("Error fetching purchases:", err);
      setError((prev) => ({
        ...prev,
        purchases: "Network error or failed to connect to the server.",
      }));
    } finally {
      setLoading((prev) => ({ ...prev, purchases: false }));
    }
  };

  useEffect(() => {
    fetchServices();
    if (keycloak.authenticated) {
      fetchPurchases();
    }
  }, [keycloak, keycloak.authenticated]);

  // Handle Buy button click
  const handleBuyClick = (service) => {
    setBuyingService(service);
    setBuyQuantity(1);
    setPurchaseMessage(null);
  };

  // Handle Purchase Service (keep your existing implementation)
  const handlePurchaseService = async (e) => {
    e.preventDefault();
    setPurchaseLoading(true);
    setPurchaseMessage(null);

    if (!keycloak || !keycloak.authenticated || !keycloak.token) {
      setPurchaseMessage("Authentication required to purchase a service.");
      setPurchaseLoading(false);
      return;
    }
    if (!buyingService) {
      setPurchaseMessage("No service selected for purchase.");
      setPurchaseLoading(false);
      return;
    }
    if (isNaN(buyQuantity) || buyQuantity <= 0) {
      setPurchaseMessage("Quantity must be a positive number.");
      setPurchaseLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:3001/api/services/${buyingService.id}/buy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${keycloak.token}`,
          },
          body: JSON.stringify({ quantity: parseFloat(buyQuantity) }),
        }
      );

      const data = await response.json();
      if (response.ok) {
        setPurchaseMessage(
          `✅ Purchase successful!\n
  ${buyQuantity} x ${buyingService.name}\n
  Total: ${(parseFloat(buyingService.price) * buyQuantity).toFixed(
    7
  )} BLUEDOLLAR\n
  Transaction ID: ${data.stellarTransactionId || "Not available"}`
        );
        // Refresh purchases after successful purchase
        fetchPurchases();
        // Auto-close the modal after 5 seconds
        setTimeout(() => {
          setBuyingService(null);
        }, 5000);
      } else {
        setPurchaseMessage(
          `❌ Failed: ${data.message || "Failed to purchase service."}`
        );
      }
    } catch (error) {
      setPurchaseMessage(
        `❌ Error: ${error.message || "Network error purchasing service."}`
      );
    } finally {
      setPurchaseLoading(false);
    }
  };

  return (
    <div className="service-catalog-dashboard">
      <h2>Services</h2>

      {/* Tabs */}
      <div className="service-tabs">
        <button
          className={`tab-button ${activeTab === "available" ? "active" : ""}`}
          onClick={() => setActiveTab("available")}
        >
          Available Services
        </button>
        <button
          className={`tab-button ${activeTab === "purchased" ? "active" : ""}`}
          onClick={() => setActiveTab("purchased")}
        >
          My Purchases
        </button>
      </div>

      {/* Buy Service Modal (keep your existing modal) */}
      {buyingService && (
        <div className="buy-service-modal-overlay">
          <div className="buy-service-modal">
            {/* ... your existing modal content ... */}
          </div>
        </div>
      )}

      {/* Available Services Tab */}
      {activeTab === "available" && (
        <>
          {loading.services ? (
            <p>Loading services.....</p>
          ) : error.services ? (
            <p className="error-message">{error.services}</p>
          ) : services.length > 0 ? (
            <div className="service-list-grid">
              {services.map((service) => (
                <div key={service.id} className="services-card">
                  <h3>{service.name}</h3>
                  <p className="service-description">{service.description}</p>
                  <p className="service-price">
                    Price:{" "}
                    <strong>
                      {parseFloat(service.price).toFixed(7)} BLUEDOLLAR
                    </strong>
                  </p>
                  <p className="service-owner">
                    Owner ID: {service.owner_user_id.substring(0, 8)}...
                  </p>
                  {service.is_active ? (
                    <span className="status active">Active</span>
                  ) : (
                    <span className="status inactive">Inactive</span>
                  )}
                  <button
                    className="buy-button"
                    onClick={() => handleBuyClick(service)}
                    disabled={!service.is_active || purchaseLoading}
                  >
                    Buy Services
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p>No active services available for purchase at the moment.</p>
          )}
        </>
      )}

      {/* Purchased Services Tab */}
      {activeTab === "purchased" && (
        <>
          {loading.purchases ? (
            <p>Loading purchases...</p>
          ) : error.purchases ? (
            <p className="error-message">{error.purchases}</p>
          ) : purchases.length > 0 ? (
            <div className="purchases-list">
              {purchases.map((purchase) => (
                <div key={purchase.id} className="purchase-card">
                  <h3>{purchase.service_name}</h3>
                  <p className="purchase-description">
                    {purchase.service_description}
                  </p>
                  <div className="purchase-details">
                    <p>
                      <strong>Quantity:</strong> {purchase.quantity}
                    </p>
                    <p>
                      <strong>Unit Price:</strong>{" "}
                      {parseFloat(purchase.service_price).toFixed(7)}{" "}
                      {purchase.currency_code}
                    </p>
                    <p>
                      <strong>Total Price:</strong>{" "}
                      {parseFloat(purchase.total_price).toFixed(7)}{" "}
                      {purchase.currency_code}
                    </p>
                    <p>
                      <strong>Purchase Date:</strong>{" "}
                      {new Date(purchase.purchase_date).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>You haven't purchased any services yet.</p>
          )}
        </>
      )}
    </div>
  );
};

export default ServiceCatalog;
