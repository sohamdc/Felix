// frontend/src/components/ServiceManagement.jsx
import React, { useState, useEffect } from "react";
import "./ServiceManagement.css";

const ServiceManagement = ({ keycloak }) => {
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [servicesError, setServicesError] = useState(null);

  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDescription, setNewServiceDescription] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(null);
  const [createError, setCreateError] = useState(null);

  const [editingService, setEditingService] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(null);
  const [updateError, setUpdateError] = useState(null);

  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState(null);

  const [currentInternalUserId, setCurrentInternalUserId] = useState(null);
  const [isEntityOwner, setIsEntityOwner] = useState(false);

  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState(null);
  const [buyQuantity, setBuyQuantity] = useState(1); // State for quantity input in buy modal/form
  const [buyingService, setBuyingService] = useState(null); // Service currently selected for buying

  // Function to check if the current user has the 'entity_owner' role
  const checkEntityOwnerRole = () => {
    if (keycloak && keycloak.authenticated && keycloak.realmAccess) {
      const roles = keycloak.realmAccess.roles || [];
      return roles.includes("entity_owner");
    }
    return false;
  };

  // Function to fetch the current user's internal ID
  const fetchCurrentInternalUserId = async () => {
    if (!keycloak || !keycloak.authenticated || !keycloak.token) {
      setCurrentInternalUserId(null);
      return;
    }
    try {
      const response = await fetch("http://localhost:3001/api/user/me", {
        headers: {
          Authorization: `Bearer ${keycloak.token}`,
        },
      });
      const data = await response.json();
      if (response.ok) {
        setCurrentInternalUserId(data.userId);
      } else {
        console.error("Failed to fetch internal user ID:", data.message);
        setCurrentInternalUserId(null);
      }
    } catch (error) {
      console.error("Network error fetching internal user ID:", error);
      setCurrentInternalUserId(null);
    }
  };

  // Function to fetch all services
  const fetchServices = async () => {
    setLoadingServices(true);
    setServicesError(null);
    try {
      const response = await fetch("http://localhost:3001/api/services");
      const data = await response.json();
      if (response.ok) {
        setServices(data.services);
      } else {
        setServicesError(data.message || "Failed to fetch services.");
        console.error("Error fetching services:", data.message);
      }
    } catch (error) {
      setServicesError(error.message || "Network error fetching services.");
      console.error("Network error fetching services:", error);
    } finally {
      setLoadingServices(false);
    }
  };

  // Handle Create Service
  const handleCreateService = async (e) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateSuccess(null);
    setCreateError(null);

    if (!keycloak || !keycloak.authenticated || !keycloak.token) {
      setCreateError("Authentication required to create a service.");
      setCreateLoading(false);
      return;
    }

    try {
      const response = await fetch("http://localhost:3001/api/services", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keycloak.token}`,
        },
        body: JSON.stringify({
          name: newServiceName,
          description: newServiceDescription,
          price: parseFloat(newServicePrice),
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setCreateSuccess(data.message);
        setNewServiceName("");
        setNewServiceDescription("");
        setNewServicePrice("");
        fetchServices(); // Refresh list after creation
      } else {
        setCreateError(data.message || "Failed to create service.");
      }
    } catch (error) {
      setCreateError(error.message || "Network error creating service.");
    } finally {
      setCreateLoading(false);
    }
  };

  // Handle Edit button click
  const handleEditClick = (service) => {
    setEditingService(service);
    setEditName(service.name);
    setEditDescription(service.description);
    setEditPrice(service.price);
    setEditIsActive(service.is_active);
    setUpdateSuccess(null);
    setUpdateError(null);
  };

  // Handle Update Service
  const handleUpdateService = async (e) => {
    e.preventDefault();
    setUpdateLoading(true);
    setUpdateSuccess(null);
    setUpdateError(null);

    if (!keycloak || !keycloak.authenticated || !keycloak.token) {
      setUpdateError("Authentication required to update a service.");
      setUpdateLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:3001/api/services/${editingService.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${keycloak.token}`,
          },
          body: JSON.stringify({
            name: editName,
            description: editDescription,
            price: parseFloat(editPrice),
            is_active: editIsActive,
          }),
        }
      );

      const data = await response.json();
      if (response.ok) {
        setUpdateSuccess(data.message);
        setEditingService(null); // Exit edit mode
        fetchServices(); // Refresh list after update
      } else {
        setUpdateError(data.message || "Failed to update service.");
      }
    } catch (error) {
      setUpdateError(error.message || "Network error updating service.");
    } finally {
      setUpdateLoading(false);
    }
  };

  // Handle Delete Service
  const handleDeleteService = async (serviceId) => {
    if (!window.confirm("Are you sure you want to delete this service?")) {
      return;
    }

    setDeleteLoading(true);
    setDeleteMessage(null);

    if (!keycloak || !keycloak.authenticated || !keycloak.token) {
      setDeleteMessage("Authentication required to delete a service.");
      setDeleteLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:3001/api/services/${serviceId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
          },
        }
      );

      const data = await response.json();
      if (response.ok) {
        setDeleteMessage(data.message);
        fetchServices(); // Refresh list after deletion
      } else {
        setDeleteMessage(data.message || "Failed to delete service.");
      }
    } catch (error) {
      setDeleteMessage(error.message || "Network error deleting service.");
    } finally {
      setDeleteLoading(false);
    }
  };

  // Handle Buy button click - opens buy modal/sets service to buy
  const handleBuyClick = (service) => {
    setBuyingService(service);
    setBuyQuantity(1); // Reset quantity for new purchase
    setPurchaseMessage(null); // Clear previous messages
  };

  // Handle Purchase Service
  const handlePurchaseService = async (e) => {
    e.preventDefault(); // Prevent form submission if using a form for quantity
    setPurchaseLoading(true);
    setPurchaseMessage(null);

    if (!keycloak || !keycloak.authenticated || !keycloak.token) {
      setPurchaseMessage("Authentication required to purchase a service.");
      setPurchaseLoading(false);
      return;
    }
    if (!buyingService) {
      // Should not happen if UI is correct
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
          data.message + ` Tx ID: ${data.stellarTransactionId}`
        );
        setBuyingService(null); // Close buy modal
        // No need to fetch services, as stock is not managed per service
      } else {
        setPurchaseMessage(data.message || "Failed to purchase service.");
      }
    } catch (error) {
      setPurchaseMessage(error.message || "Network error purchasing service.");
    } finally {
      setPurchaseLoading(false);
    }
  };

  // Effect to fetch services and user ID on component mount or authentication change
  useEffect(() => {
    fetchServices();
    fetchCurrentInternalUserId();
  }, [keycloak?.authenticated, keycloak?.token]); // Re-fetch on login/logout

  // Effect to check entity_owner role
  useEffect(() => {
    setIsEntityOwner(checkEntityOwnerRole());
  }, [keycloak?.realmAccess?.roles]); // Re-check if roles change

  return (
    <div className="service-management-dashboard">
      <h2>Service Management</h2>

      {isEntityOwner && (
        <div className="service-card create-service-card">
          <h3>{editingService ? "Edit Service" : "Create New Service"}</h3>
          <form
            onSubmit={
              editingService ? handleUpdateService : handleCreateService
            }
          >
            <div className="form-group">
              <label htmlFor="serviceName">Name:</label>
              <input
                type="text"
                id="serviceName"
                value={editingService ? editName : newServiceName}
                onChange={(e) =>
                  editingService
                    ? setEditName(e.target.value)
                    : setNewServiceName(e.target.value)
                }
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="serviceDescription">Description:</label>
              <textarea
                id="serviceDescription"
                value={editingService ? editDescription : newServiceDescription}
                onChange={(e) =>
                  editingService
                    ? setEditDescription(e.target.value)
                    : setNewServiceDescription(e.target.value)
                }
                required
              ></textarea>
            </div>
            <div className="form-group">
              <label htmlFor="servicePrice">Price (BLUEDOLLAR):</label>
              <input
                type="number"
                id="servicePrice"
                value={editingService ? editPrice : newServicePrice}
                onChange={(e) =>
                  editingService
                    ? setEditPrice(e.target.value)
                    : setNewServicePrice(e.target.value)
                }
                step="0.0000001" // Allow decimal for price
                required
              />
            </div>
            {editingService && (
              <div className="form-group">
                <label htmlFor="serviceIsActive">Active:</label>
                <input
                  type="checkbox"
                  id="serviceIsActive"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                />
              </div>
            )}
            <button type="submit" disabled={createLoading || updateLoading}>
              {createLoading
                ? "Creating..."
                : updateLoading
                ? "Updating..."
                : editingService
                ? "Update Service"
                : "Create Service"}
            </button>
            {createSuccess && (
              <p className="success-message">{createSuccess}</p>
            )}
            {createError && <p className="error-message">{createError}</p>}
            {updateSuccess && (
              <p className="success-message">{updateSuccess}</p>
            )}
            {updateError && <p className="error-message">{updateError}</p>}
            {editingService && (
              <button
                type="button"
                onClick={() => setEditingService(null)}
                className="cancel-edit-button"
              >
                Cancel Edit
              </button>
            )}
          </form>
        </div>
      )}

      {/* Buy Service Modal/Form */}
      {buyingService && (
        <div className="buy-service-modal-overlay">
          <div className="buy-service-modal">
            <h3>Purchase {buyingService.name}</h3>
            <p>
              Price per unit: {parseFloat(buyingService.price).toFixed(7)}{" "}
              BLUEDOLLAR
            </p>
            <form onSubmit={handlePurchaseService}>
              <div className="form-group">
                <label htmlFor="buyQuantity">Quantity:</label>
                <input
                  type="number"
                  id="buyQuantity"
                  value={buyQuantity}
                  onChange={(e) => setBuyQuantity(e.target.value)}
                  min="1"
                  step="1"
                  required
                />
              </div>
              <p>
                Total Cost:{" "}
                {(parseFloat(buyingService.price) * buyQuantity).toFixed(7)}{" "}
                BLUEDOLLAR
              </p>
              <div className="modal-actions">
                <button type="submit" disabled={purchaseLoading}>
                  {purchaseLoading ? "Processing..." : "Confirm Purchase"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBuyingService(null);
                    setPurchaseMessage(null); // Clear message on close
                  }}
                  disabled={purchaseLoading}
                >
                  Cancel
                </button>
              </div>
              {purchaseMessage && (
                <p
                  className={
                    purchaseMessage.includes("Failed") ||
                    purchaseMessage.includes("Error")
                      ? "error-message"
                      : "success-message"
                  }
                >
                  {purchaseMessage}
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      <div className="service-card service-list-card">
        <h3>All Available Services</h3>
        {loadingServices ? (
          <p>Loading services...</p>
        ) : servicesError ? (
          <p className="error-message">Error: {servicesError}</p>
        ) : services.length > 0 ? (
          <ul>
            {services.map((service) => (
              <li key={service.id} className="service-item">
                <h4>{service.name}</h4>
                <p>
                  Description:{service.description}
                  <br />
                  Price: {parseFloat(service.price).toFixed(7)} BLUEDOLLAR
                  <br />
                  Status: {service.is_active ? "Active" : "Inactive"}
                  <br />
                  <small>
                    Created at time:{" "}
                    {new Date(service.created_at).toLocaleString()}
                    <br />
                    Updated at time:{" "}
                    {new Date(service.updated_at).toLocaleString()}
                  </small>
                </p>
                <div className="service-actions">
                  {keycloak.authenticated &&
                    currentInternalUserId !== service.owner_user_id &&
                    service.is_active && (
                      <button
                        className="buy-button"
                        onClick={() => handleBuyClick(service)}
                        disabled={purchaseLoading}
                      >
                        Buy Service
                      </button>
                    )}
                  {isEntityOwner &&
                    currentInternalUserId === service.owner_user_id && (
                      <>
                        <button
                          className="edit-button"
                          onClick={() => handleEditClick(service)}
                          disabled={
                            deleteLoading || updateLoading || purchaseLoading
                          }
                        >
                          Edit
                        </button>
                        <button
                          className="delete-button"
                          onClick={() => handleDeleteService(service.id)}
                          disabled={
                            deleteLoading || updateLoading || purchaseLoading
                          }
                        >
                          {deleteLoading && deleteMessage === null
                            ? "Deleting..."
                            : "Delete"}
                        </button>
                      </>
                    )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>No services found.</p>
        )}
        {deleteMessage && (
          <p
            className={
              deleteMessage.includes("Error")
                ? "error-message"
                : "success-message"
            }
          >
            {deleteMessage}
          </p>
        )}
      </div>
    </div>
  );
};

export default ServiceManagement;
