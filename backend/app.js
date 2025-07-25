import "dotenv/config"; // Ensure dotenv is loaded first to access process.env
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import session from "express-session";
import Keycloak from "keycloak-connect";
import pkg from "pg"; // Import the pg library
import crypto from "crypto-js";
const { Pool } = pkg; // Destructure Pool from pkg

// --- START STELLAR SDK CONFIGURATION (from your friend's code) ---
import StellarSdk from "@stellar/stellar-sdk"; // Correct package and default import

const {
  Networks, // Plural, holds TESTNET and PUBLIC
  Keypair,
  Asset,
  TransactionBuilder,
  Operation,
  Memo,
} = StellarSdk; // Destructure from the default import

const BLUEDOLLAR_ISSUER_PUBLIC_KEY = process.env.BLUEDOLLAR_ISSUER_PUBLIC_KEY;

function decrypt(ciphertext) {
  if (!ciphertext) {
    throw new Error("Ciphertext is empty, cannot decrypt.");
  }
  if (!process.env.ENCRYPTION_SECRET) {
    // This environment variable is crucial for decryption
    console.error("ENCRYPTION_SECRET is not defined in environment variables.");
    throw new Error("Server encryption key is not configured.");
  }
  const bytes = crypto.AES.decrypt(ciphertext, process.env.ENCRYPTION_SECRET);
  return bytes.toString(crypto.enc.Utf8);
}

const getAsset = (code, issuer) => {
  if (code === "XLM") {
    return StellarSdk.Asset.native();
  }
  if (!issuer) {
    throw new Error(`Issuer is required for non-XLM asset: ${code}`);
  }
  return new StellarSdk.Asset(code, issuer);
};

const server = new StellarSdk.Horizon.Server( // Access Horizon.Server
  process.env.STELLAR_NETWORK === "public"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org"
);
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;
const network =
  process.env.STELLAR_NETWORK === "public" ? Networks.PUBLIC : Networks.TESTNET; // Use Networks.PUBLIC/TESTNET
// --- END STELLAR SDK CONFIGURATION ---

const app = express();
const port = process.env.PORT || 3001;

// --- Keycloak Configuration (Existing) ---
const memoryStore = new session.MemoryStore();

app.use(
  session({
    secret: process.env.SESSION_SECRET || "thisShouldBeAStrongSecret",
    resave: false,
    saveUninitialized: true,
    store: memoryStore,
  })
);

const keycloakConfig = {
  realm: "felix-realm",
  "auth-server-url": "http://localhost:8080/",
  "ssl-required": "external",
  resource: "felix-backend-client",
  "public-client": true,
  "confidential-port": 0,
};
const keycloak = new Keycloak({ store: memoryStore }, keycloakConfig);

app.use(keycloak.middleware());

// --- Database Connection Pool Setup ---
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Test the database connection
pool
  .connect()
  .then((client) => {
    console.log("Successfully connected to PostgreSQL database!");
    client.release(); // Release the client back to the pool
    // try {
    //   // Use Keypair from StellarSdk
    //   const pair = StellarSdk.Keypair.random();
    //   console.log("Generated Stellar Account Keypair:");
    //   console.log("Public Key (G...):", pair.publicKey());
    //   console.log("Secret Key (S...):", pair.secret());
    //   console.log("--- IMPORTANT: NEVER SHARE YOUR SECRET KEY ---");
    // } catch (error) {
    //   console.error("Error generating keypair:", error);
    // }
  })
  .catch((err) => {
    console.error("Database connection error:", err.stack);
    // Exit process or handle error appropriately
  });

// Middleware (Existing)
app.use(bodyParser.json());
app.use(cors()); // Configure CORS as needed

// Public route (Existing)
app.get("/api/public", (req, res) => {
  res.json({ message: "This is a public endpoint. Anyone can access it." });
});

// Protected route (requires authentication) (Existing)
app.get("/api/protected", keycloak.protect(), (req, res) => {
  const userName = req.kauth.grant.access_token.content.preferred_username;
  res.json({
    message: `Welcome, ${userName}! You accessed a protected endpoint.`,
  });
});

// Role-based protected route (requires specific role) (Existing, with your manual check)
app.get("/api/admin-only", keycloak.protect(), (req, res) => {
  console.log("--- Inside /api/admin-only route handler ---");
  console.log(
    "Access granted by keycloak.protect() (any token) for user:",
    req.kauth.grant.access_token.content.preferred_username
  );

  const rolesInToken =
    req.kauth.grant.access_token.content.realm_access.roles || [];
  console.log("Roles seen by backend (from realm_access):", rolesInToken);

  if (rolesInToken.includes("entity_owner")) {
    console.log("User has entity_owner role. Granting access.");
    res.json({ message: "This endpoint is only for entity owners!" });
  } else {
    console.log("User DOES NOT have entity_owner role. Denying access.");
    res.status(403).json({
      message:
        "Access Denied: Not authorized for /api/admin-only (missing entity_owner role in realm_access)",
    });
  }
});

// User Registration/Sync Endpoint (Protected by Keycloak)
// This endpoint will create a new user record in the 'users' table
// if they don't exist, or just return their existing data.
app.post("/api/user/sync", keycloak.protect(), async (req, res) => {
  try {
    const keycloakId = req.kauth.grant.access_token.content.sub;
    const username = req.kauth.grant.access_token.content.preferred_username;
    const email = req.kauth.grant.access_token.content.email;
    const displayName = req.kauth.grant.access_token.content.name || username; // Use name if available, else username

    // Check if user already exists in our 'users' table
    const userCheck = await pool.query(
      "SELECT id, username FROM users WHERE keycloak_id = $1",
      [keycloakId]
    );

    if (userCheck.rows.length > 0) {
      // User already exists, return existing user data
      console.log(
        `User ${username} (Keycloak ID: ${keycloakId}) already exists in DB. ID: ${userCheck.rows[0].id}`
      );
      return res.json({
        message: "User already synced.",
        user: userCheck.rows[0],
      });
    } else {
      // User does not exist, create new record
      const newUser = await pool.query(
        "INSERT INTO users (keycloak_id, username, email, display_name) VALUES ($1, $2, $3, $4) RETURNING id, username",
        [keycloakId, username, email, displayName]
      );
      console.log(
        `New user ${username} (Keycloak ID: ${keycloakId}) registered in DB. ID: ${newUser.rows[0].id}`
      );
      return res.status(201).json({
        message: "User registered successfully.",
        user: newUser.rows[0],
      });
    }
  } catch (error) {
    console.error("Error syncing user:", error);
    return res
      .status(500)
      .json({ message: "Error syncing user data.", error: error.message });
  }
});

app.get("/api/public-services", keycloak.protect(), async (req, res) => {
  try {
    // This endpoint is for general authenticated users to browse services.
    // It should only show active services that are available for purchase.
    // Ensure your 'services' table has an 'is_active' column.
    const result = await pool.query(
      "SELECT id, name, description, price, owner_user_id, is_active FROM services WHERE is_active = TRUE ORDER BY name ASC"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching public services:", error);
    res.status(500).json({
      message: "Failed to fetch public services.",
      error: error.message,
    });
  }
});

app.post("/api/services", keycloak.protect(), async (req, res) => {
  // keycloak.protect() ensures a valid token
  try {
    const rolesInToken =
      req.kauth.grant.access_token.content.realm_access.roles || [];

    if (!rolesInToken.includes("entity_owner")) {
      console.log(
        "User DOES NOT have entity_owner role. Denying access to POST /api/services."
      );
      return res.status(403).json({
        message:
          "Access Denied: Not authorized to create services (missing entity_owner role).",
      });
    }

    const { name, description, price } = req.body;
    const keycloakId = req.kauth.grant.access_token.content.sub;

    if (!name || !description || price === undefined || price === null) {
      return res.status(400).json({
        message: "Missing required service fields: name, description, price.",
      });
    }

    // Ensure price is a valid number
    const servicePrice = parseFloat(price);
    if (isNaN(servicePrice) || servicePrice < 0) {
      return res
        .status(400)
        .json({ message: "Price must be a non-negative number." });
    }

    // Get the owner_user_id from the authenticated Keycloak user (entity_owner's internal user ID)
    const userResult = await pool.query(
      "SELECT id FROM users WHERE keycloak_id = $1",
      [keycloakId]
    );
    if (userResult.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Entity owner user not found in internal database." });
    }
    const ownerUserId = userResult.rows[0].id;

    const result = await pool.query(
      `INSERT INTO public.services (owner_user_id, name, description, price)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, price, is_active, created_at, updated_at`,
      [ownerUserId, name, description, servicePrice]
    );

    res.status(201).json({
      message: "Service created successfully.",
      service: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating service:", error);
    if (error.code === "23505") {
      // Unique violation for 'name'
      return res
        .status(409)
        .json({ message: "A service with this name already exists." });
    }
    res
      .status(500)
      .json({ message: "Failed to create service.", error: error.message });
  }
});

app.put("/api/services/:id", keycloak.protect(), async (req, res) => {
  // keycloak.protect() ensures a valid token
  try {
    const rolesInToken =
      req.kauth.grant.access_token.content.realm_access.roles || [];

    if (!rolesInToken.includes("entity_owner")) {
      console.log(
        "User DOES NOT have entity_owner role. Denying access to PUT /api/services/:id."
      );
      return res.status(403).json({
        message:
          "Access Denied: Not authorized to update services (missing entity_owner role).",
      });
    }

    const { id } = req.params;
    const { name, description, price, is_active } = req.body;
    const keycloakId = req.kauth.grant.access_token.content.sub;

    // Get the owner_user_id from the authenticated Keycloak user
    const userResult = await pool.query(
      "SELECT id FROM users WHERE keycloak_id = $1",
      [keycloakId]
    );
    if (userResult.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Entity owner user not found in internal database." });
    }
    const ownerUserId = userResult.rows[0].id;

    const updates = [];
    const values = [id, ownerUserId]; // First two values are for WHERE clause
    let paramIndex = 3; // Start parameters for SET clause from $3

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (price !== undefined) {
      const servicePrice = parseFloat(price);
      if (isNaN(servicePrice) || servicePrice < 0) {
        return res
          .status(400)
          .json({ message: "Price must be a non-negative number." });
      }
      updates.push(`price = $${paramIndex++}`);
      values.push(servicePrice);
    }
    if (is_active !== undefined) {
      if (typeof is_active !== "boolean") {
        return res
          .status(400)
          .json({ message: "is_active must be a boolean value." });
      }
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ message: "No fields provided for update." });
    }

    // Add updated_at timestamp automatically
    updates.push(`updated_at = NOW()`);

    const query = `
      UPDATE public.services
      SET ${updates.join(", ")}
      WHERE id = $1 AND owner_user_id = $2
      RETURNING id, name, description, price, is_active, created_at, updated_at`;

    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({
        message:
          "Service not found or you do not have permission to update it.",
      });
    }

    res.status(200).json({
      message: "Service updated successfully.",
      service: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating service:", error);
    if (error.code === "23505") {
      // Unique violation for 'name'
      return res
        .status(409)
        .json({ message: "A service with this name already exists." });
    }
    res
      .status(500)
      .json({ message: "Failed to update service.", error: error.message });
  }
});

app.delete("/api/services/:id", keycloak.protect(), async (req, res) => {
  // keycloak.protect() ensures a valid token
  try {
    const rolesInToken =
      req.kauth.grant.access_token.content.realm_access.roles || [];

    if (!rolesInToken.includes("entity_owner")) {
      console.log(
        "User DOES NOT have entity_owner role. Denying access to DELETE /api/services/:id."
      );
      return res.status(403).json({
        message:
          "Access Denied: Not authorized to delete services (missing entity_owner role).",
      });
    }

    const { id } = req.params;
    const keycloakId = req.kauth.grant.access_token.content.sub;

    // Get the owner_user_id from the authenticated Keycloak user
    const userResult = await pool.query(
      "SELECT id FROM users WHERE keycloak_id = $1",
      [keycloakId]
    );
    if (userResult.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Entity owner user not found in internal database." });
    }
    const ownerUserId = userResult.rows[0].id;

    const result = await pool.query(
      `DELETE FROM public.services
       WHERE id = $1 AND owner_user_id = $2`, // Ensure only owner can delete
      [id, ownerUserId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message:
          "Service not found or you do not have permission to delete it.",
      });
    }

    res
      .status(200)
      .json({ message: `Service with ID ${id} deleted successfully.` });
  } catch (error) {
    console.error("Error deleting service:", error);
    res
      .status(500)
      .json({ message: "Failed to delete service.", error: error.message });
  }
});

app.get("/api/services", async (req, res) => {
  // Remains publicly accessible
  try {
    const result = await pool.query(
      `SELECT id, name, description, price, is_active, created_at, updated_at, owner_user_id
       FROM public.services
       WHERE is_active = TRUE
       ORDER BY created_at DESC`
    );
    res.status(200).json({ services: result.rows });
  } catch (error) {
    console.error("Error fetching services:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch services.", error: error.message });
  }
});

// app.js

// ... (existing code) ...

// app.post("/api/services/:id/buy", keycloak.protect(), async (req, res) => {
//   const client = await pool.connect();
//   try {
//     const { id: serviceId } = req.params;
//     let { quantity } = req.body;
//     const buyerKeycloakId = req.kauth.grant.access_token.content.sub;

//     console.log(
//       `[BUY] Attempting purchase for service: ${serviceId}, quantity: ${quantity}`
//     );

//     if (quantity === undefined || quantity === null) {
//       quantity = 1;
//     } else {
//       quantity = parseFloat(quantity);
//       if (isNaN(quantity) || quantity <= 0) {
//         return res
//           .status(400)
//           .json({ message: "Quantity must be a positive number." });
//       }
//     }

//     await client.query("BEGIN");
//     console.log("[BUY] Database transaction started.");

//     // 1. Fetch service details
//     // ... (your service fetch logic) ...
//     console.log("[BUY] Service details fetched.");

//     const totalPrice = service.price * quantity;
//     console.log(`[BUY] Calculated total price: ${totalPrice}`);

//     // 2. Get buyer's internal user ID
//     // ... (your buyer user fetch logic) ...
//     const buyerInternalUserId = buyerUserResult.rows[0].id;
//     console.log(`[BUY] Buyer Internal User ID: ${buyerInternalUserId}`);

//     // NEW: Get buyer's public key and encrypted secret from 'wallets' table
//     // ... (your buyer wallet fetch logic) ...
//     const buyerPublicKey = buyerWalletResult.rows[0].public_key;
//     const buyerSecretKey = decrypt(
//       buyerWalletResult.rows[0].secret_key_encrypted
//     );
//     console.log(`[BUY] Buyer Wallet Public Key: ${buyerPublicKey}`);

//     // Check if buyer is trying to buy their own service
//     // ... (your self-purchase check) ...

//     // 3. Get seller's (service owner's) public key from 'wallets' table
//     // ... (your seller wallet fetch logic) ...
//     const sellerPublicKey = sellerWalletResult.rows[0].public_key;
//     console.log(`[BUY] Seller Wallet Public Key: ${sellerPublicKey}`);

//     // --- Stellar Transaction ---
//     console.log("[BUY] Starting Stellar transaction process...");

//     if (!BLUEDOLLAR_ISSUER_PUBLIC_KEY) {
//       await client.query("ROLLBACK");
//       console.error("[BUY ERROR] BLUEDOLLAR_ISSUER_PUBLIC_KEY is not defined.");
//       return res
//         .status(500)
//         .json({ message: "BlueDollar issuer not configured on server." });
//     }
//     const blueDollarAsset = new StellarSdk.Asset(
//       "BLUEDOLLAR",
//       BLUEDOLLAR_ISSUER_PUBLIC_KEY
//     );
//     console.log("[BUY] BlueDollar Asset configured.");

//     try {
//       const buyerKeyPair = StellarSdk.Keypair.fromSecret(buyerSecretKey);
//       console.log(`[BUY] Attempting to load buyer account: ${buyerPublicKey}`);
//       const account = await server.loadAccount(buyerPublicKey); // <--- This is a common point for hangs/errors
//       console.log("[BUY] Buyer account loaded successfully.");

//       const transaction = new StellarSdk.TransactionBuilder(account, {
//         fee: StellarSdk.BASE_FEE,
//         networkPassphrase:
//           StellarSdk.Networks[process.env.STELLAR_NETWORK.toUpperCase()],
//       })
//         .addOperation(
//           StellarSdk.Operation.payment({
//             destination: sellerPublicKey,
//             asset: blueDollarAsset,
//             amount: totalPrice.toString(),
//           })
//         )
//         .setTimeout(30)
//         .build();
//       console.log("[BUY] Stellar transaction built.");

//       transaction.sign(buyerKeyPair);
//       console.log("[BUY] Stellar transaction signed. Submitting to Horizon...");

//       const transactionResult = await server.submitTransaction(transaction); // <--- Another common hang/error point
//       console.log(
//         "[BUY] Stellar transaction submitted successfully:",
//         transactionResult.id
//       );

//       // 4. Record the purchase in the database
//       // ... (your purchase insert logic) ...
//       console.log("[BUY] Purchase recorded in database.");

//       await client.query("COMMIT");
//       console.log("[BUY] Database transaction committed.");
//       res.status(200).json({
//         message: "Service purchased successfully!",
//         purchaseId: purchaseInsertResult.rows[0].id,
//         stellarTransactionId: transactionResult.id,
//         totalPrice: totalPrice,
//         currency: "BLUEDOLLAR",
//       });
//     } catch (stellarError) {
//       await client.query("ROLLBACK");
//       console.error(
//         "[BUY ERROR] Stellar transaction failed with caught error:",
//         stellarError
//       );
//       let errorMessage = "Stellar transaction failed.";
//       if (stellarError.response && stellarError.response.data) {
//         console.error(
//           "[BUY ERROR] Horizon Error Details:",
//           stellarError.response.data
//         );
//         if (
//           stellarError.response.data.extras &&
//           stellarError.response.data.extras.result_codes
//         ) {
//           errorMessage = `Stellar transaction failed: ${
//             stellarError.response.data.extras.result_codes.operations ||
//             stellarError.response.data.extras.result_codes.transaction
//           }`;
//         } else {
//           errorMessage = `Stellar transaction failed: ${
//             stellarError.response.data.detail || "Unknown Horizon error"
//           }`;
//         }
//       } else if (stellarError.message) {
//         errorMessage = `Stellar transaction failed: ${stellarError.message}`;
//       }
//       res.status(500).json({ message: errorMessage });
//     }
//   } catch (error) {
//     await client.query("ROLLBACK");
//     console.error("[BUY ERROR] General error purchasing service:", error);
//     res
//       .status(500)
//       .json({ message: "Failed to purchase service.", error: error.message });
//   } finally {
//     client.release();
//     console.log("[BUY] Database client released.");
//   }
// });

app.post("/api/services/:id/buy", keycloak.protect(), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id: serviceId } = req.params;
    let { quantity } = req.body;
    const buyerKeycloakId = req.kauth.grant.access_token.content.sub;

    console.log(
      `[BUY] Attempting purchase for service: ${serviceId}, quantity: ${quantity}`
    );

    if (quantity === undefined || quantity === null) {
      quantity = 1;
    } else {
      quantity = parseFloat(quantity);
      if (isNaN(quantity) || quantity <= 0) {
        return res
          .status(400)
          .json({ message: "Quantity must be a positive number." });
      }
    }

    await client.query("BEGIN");
    console.log("[BUY] Database transaction started.");

    // 1. Fetch service details
    const serviceResult = await client.query(
      // <--- ADDED THIS QUERY
      `SELECT id, owner_user_id, name, description, price, is_active
       FROM public.services
       WHERE id = $1`,
      [serviceId]
    );

    if (serviceResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Service not found." });
    }
    const service = serviceResult.rows[0]; // <--- THIS IS WHERE 'service' IS DEFINED
    console.log("[BUY] Service details fetched.");

    if (!service.is_active) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "This service is currently inactive and cannot be purchased.",
      });
    }

    const totalPrice = service.price * quantity;
    console.log(`[BUY] Calculated total price: ${totalPrice}`);

    // 2. Get buyer's internal user ID
    const buyerUserResult = await client.query(
      // <--- ADDED THIS QUERY
      `SELECT id FROM users WHERE keycloak_id = $1`,
      [buyerKeycloakId]
    );

    if (buyerUserResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ message: "Buyer user not found in internal database." });
    }
    const buyerInternalUserId = buyerUserResult.rows[0].id;
    console.log(`[BUY] Buyer Internal User ID: ${buyerInternalUserId}`);

    // Get buyer's public key and encrypted secret from 'wallets' table
    const buyerWalletResult = await client.query(
      // <--- ADDED THIS QUERY
      `SELECT public_key, encrypted_secret_key FROM wallets WHERE user_id = $1`,
      [buyerInternalUserId]
    );

    if (buyerWalletResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ message: "Buyer's Stellar wallet not found." });
    }
    const buyerPublicKey = buyerWalletResult.rows[0].public_key;
    const buyerSecretKey = decrypt(
      buyerWalletResult.rows[0].encrypted_secret_key
    );
    console.log(`[BUY] Buyer Wallet Public Key: ${buyerPublicKey}`);

    // Check if buyer is trying to buy their own service
    if (buyerInternalUserId === service.owner_user_id) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ message: "You cannot purchase your own service." });
    }

    // 3. Get seller's (service owner's) public key from 'wallets' table
    const sellerWalletResult = await client.query(
      // <--- ADDED THIS QUERY
      `SELECT public_key FROM wallets WHERE user_id = $1`,
      [service.owner_user_id]
    );

    if (sellerWalletResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ message: "Seller's Stellar wallet not found." });
    }
    const sellerPublicKey = sellerWalletResult.rows[0].public_key;
    console.log(`[BUY] Seller Wallet Public Key: ${sellerPublicKey}`);

    // --- Stellar Transaction ---
    console.log("[BUY] Starting Stellar transaction process...");

    if (!BLUEDOLLAR_ISSUER_PUBLIC_KEY) {
      await client.query("ROLLBACK");
      console.error("[BUY ERROR] BLUEDOLLAR_ISSUER_PUBLIC_KEY is not defined.");
      return res
        .status(500)
        .json({ message: "BlueDollar issuer not configured on server." });
    }
    const blueDollarAsset = new StellarSdk.Asset(
      "BLUEDOLLAR",
      BLUEDOLLAR_ISSUER_PUBLIC_KEY
    );
    console.log("[BUY] BlueDollar Asset configured.");

    try {
      const buyerKeyPair = StellarSdk.Keypair.fromSecret(buyerSecretKey);
      console.log(`[BUY] Attempting to load buyer account: ${buyerPublicKey}`);
      const account = await server.loadAccount(buyerPublicKey);
      console.log("[BUY] Buyer account loaded successfully.");

      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase:
          StellarSdk.Networks[process.env.STELLAR_NETWORK.toUpperCase()],
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination: sellerPublicKey,
            asset: blueDollarAsset,
            amount: totalPrice.toString(),
          })
        )
        .setTimeout(30)
        .build();
      console.log("[BUY] Stellar transaction built.");

      transaction.sign(buyerKeyPair);
      console.log("[BUY] Stellar transaction signed. Submitting to Horizon...");

      const transactionResult = await server.submitTransaction(transaction);
      console.log(
        "[BUY] Stellar transaction submitted successfully:",
        transactionResult.id
      );

      // 4. Record the purchase in the database
      const purchaseInsertResult = await client.query(
        // <--- ADDED THIS QUERY
        `INSERT INTO public.purchases (service_id, buyer_user_id, quantity, total_price, currency_code)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, purchase_date`,
        [serviceId, buyerInternalUserId, quantity, totalPrice, "BLUEDOLLAR"]
      );
      console.log("[BUY] Purchase recorded in database.");

      await client.query("COMMIT");
      console.log("[BUY] Database transaction committed.");
      res.status(200).json({
        message: "Service purchased successfully!",
        purchaseId: purchaseInsertResult.rows[0].id,
        stellarTransactionId: transactionResult.id,
        totalPrice: totalPrice,
        currency: "BLUEDOLLAR",
      });
    } catch (stellarError) {
      await client.query("ROLLBACK");
      console.error(
        "[BUY ERROR] Stellar transaction failed with caught error:",
        stellarError
      );
      let errorMessage = "Stellar transaction failed.";
      if (stellarError.response && stellarError.response.data) {
        console.error(
          "[BUY ERROR] Horizon Error Details:",
          stellarError.response.data
        );
        if (
          stellarError.response.data.extras &&
          stellarError.response.data.extras.result_codes
        ) {
          errorMessage = `Stellar transaction failed: ${
            stellarError.response.data.extras.result_codes.operations ||
            stellarError.response.data.extras.result_codes.transaction
          }`;
        } else {
          errorMessage = `Stellar transaction failed: ${
            stellarError.response.data.detail || "Unknown Horizon error"
          }`;
        }
      } else if (stellarError.message) {
        errorMessage = `Stellar transaction failed: ${stellarError.message}`;
      }
      res.status(500).json({ message: errorMessage });
    }
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[BUY ERROR] General error purchasing service:", error);
    res
      .status(500)
      .json({ message: "Failed to purchase service.", error: error.message });
  } finally {
    client.release();
    console.log("[BUY] Database client released.");
  }
});

app.get("/api/purchases/me", keycloak.protect(), async (req, res) => {
  try {
    const keycloakId = req.kauth.grant.access_token.content.sub;

    // Get internal user ID
    const userResult = await pool.query(
      "SELECT id FROM users WHERE keycloak_id = $1",
      [keycloakId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found in database." });
    }

    const userId = userResult.rows[0].id;

    // Fetch purchases with service details - updated to match your schema
    const purchasesResult = await pool.query(
      `SELECT 
        p.id, 
        p.service_id,
        p.quantity, 
        p.total_price, 
        p.currency_code,
        p.purchase_date,
        s.name as service_name,
        s.description as service_description,
        s.price as service_price,
        s.owner_user_id
       FROM purchases p
       JOIN services s ON p.service_id = s.id
       WHERE p.buyer_user_id = $1
       ORDER BY p.purchase_date DESC`,
      [userId]
    );

    res.status(200).json({ purchases: purchasesResult.rows });
  } catch (error) {
    console.error("Error fetching purchases:", error);
    res.status(500).json({
      message: "Failed to fetch purchases.",
      error: error.message,
    });
  }
});

app.get("/api/user/me", keycloak.protect(), async (req, res) => {
  try {
    const keycloakId = req.kauth.grant.access_token.content.sub;
    const userResult = await pool.query(
      "SELECT id FROM users WHERE keycloak_id = $1",
      [keycloakId]
    );
    if (userResult.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "User not found in internal database." });
    }
    res.status(200).json({ userId: userResult.rows[0].id });
  } catch (error) {
    console.error("Error fetching current user's internal ID:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch user ID.", error: error.message });
  }
});

// Get Current User Data Endpoint (Protected by Keycloak)
// Fetches the user's data from the 'users' table based on their Keycloak ID.
// app.get("/api/user/me", keycloak.protect(), async (req, res) => {
//   try {
//     const keycloakId = req.kauth.grant.access_token.content.sub;

//     const result = await pool.query(
//       "SELECT id, keycloak_id, username, email, display_name, created_at FROM users WHERE keycloak_id = $1",
//       [keycloakId]
//     );

//     if (result.rows.length > 0) {
//       res.json({
//         message: "User data fetched successfully.",
//         user: result.rows[0],
//       });
//     } else {
//       res.status(404).json({
//         message: "User not found in database. Please sync user first.",
//       });
//     }
//   } catch (error) {
//     console.error("Error fetching user data:", error);
//     res
//       .status(500)
//       .json({ message: "Error fetching user data.", error: error.message });
//   }
// });

app.post("/api/wallet/create", keycloak.protect(), async (req, res) => {
  try {
    const keycloakId = req.kauth.grant.access_token.content.sub;

    // 1. Get the internal user_id from your 'users' table
    const userResult = await pool.query(
      "SELECT id FROM users WHERE keycloak_id = $1",
      [keycloakId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        message: "User not found in database. Please sync user first.",
      });
    }
    const userId = userResult.rows[0].id;

    // 2. Check if the user already has a wallet (optional, but good for avoiding multiple wallets per user)
    const existingWalletCheck = await pool.query(
      "SELECT id FROM wallets WHERE user_id = $1",
      [userId]
    );
    if (existingWalletCheck.rows.length > 0) {
      return res
        .status(409)
        .json({ message: "User already has an associated Stellar wallet." });
    }

    // 3. Generate a new Stellar Keypair
    const pair = Keypair.random(); // Keypair is imported from @stellar/stellar-sdk
    const publicKey = pair.publicKey();
    const secretKey = pair.secret();

    // 4. Fund the new account using Friendbot (Testnet only)
    // Ensure 'server' and 'network' are correctly configured for Testnet
    // from your friend's code: `server` and `network` are now available
    try {
      console.log(`Attempting to fund new account: ${publicKey} on Testnet...`);
      const friendbotResponse = await server.friendbot(publicKey).call();
      console.log("Friendbot response:", friendbotResponse);
      console.log(`Account ${publicKey} funded successfully!`);
    } catch (friendbotError) {
      console.error("Error funding account with Friendbot:", friendbotError);
      return res.status(500).json({
        message:
          "Failed to fund Stellar account. Friendbot might be down or account not created.",
        error: friendbotError.response
          ? friendbotError.response.data
          : friendbotError.message,
      });
    }

    // 5. Encrypt the secret key (NFR10: Data protection)
    const encryptedSecretKey = crypto.AES.encrypt(
      secretKey,
      ENCRYPTION_SECRET
    ).toString();
    console.log("Secret key encrypted.");

    // 6. Store public key and encrypted secret key in your 'wallets' table
    const walletResult = await pool.query(
      "INSERT INTO wallets (user_id, public_key, encrypted_secret_key, is_multi_sig) VALUES ($1, $2, $3, $4) RETURNING id, public_key",
      [userId, publicKey, encryptedSecretKey, false] // is_multi_sig is false by default for now
    );

    res.status(201).json({
      message: "Stellar wallet created and funded successfully!",
      wallet: walletResult.rows[0],
      stellar: {
        publicKey: publicKey,
        // NEVER return the secret key to the frontend, even encrypted!
        // encryptedSecretKey: encryptedSecretKey // For debugging, but remove for prod!
      },
    });
  } catch (error) {
    console.error("Error creating Stellar wallet:", error);
    res.status(500).json({
      message: "Failed to create Stellar wallet.",
      error: error.message,
    });
  }
});

app.get("/api/wallet/balances", keycloak.protect(), async (req, res) => {
  try {
    const keycloakId = req.kauth.grant.access_token.content.sub;

    // 1. Get the internal user_id
    const userResult = await pool.query(
      "SELECT id FROM users WHERE keycloak_id = $1",
      [keycloakId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found in database." });
    }
    const userId = userResult.rows[0].id;

    // 2. Fetch the user's wallet public key
    const walletResult = await pool.query(
      "SELECT public_key FROM wallets WHERE user_id = $1",
      [userId]
    );
    if (walletResult.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No Stellar wallet found for this user." });
    }
    const userPublicKey = walletResult.rows[0].public_key;

    // 3. Load the account details from Horizon
    const account = await server.loadAccount(userPublicKey);

    // 4. Process the balances
    const balances = account.balances.map((balance) => {
      if (balance.asset_type === "native") {
        return {
          asset_code: "XLM",
          asset_issuer: null,
          balance: balance.balance,
        };
      } else {
        return {
          asset_code: balance.asset_code,
          asset_issuer: balance.asset_issuer,
          balance: balance.balance,
        };
      }
    });

    res.status(200).json({
      message: `Balances for wallet ${userPublicKey} fetched successfully.`,
      public_key: userPublicKey,
      balances: balances,
      // You can include other account details if needed, e.g.:
      // sequence: account.sequence,
      // num_subentries: account.num_subentries,
      // thresholds: account.thresholds
    });
  } catch (error) {
    console.error("Error fetching wallet balances:", error);
    let errorMessage = "Failed to fetch wallet balances.";
    if (error.name === "NotFoundError") {
      // Stellar SDK throws NotFoundError if account doesn't exist
      errorMessage = `Stellar account ${userPublicKey} not found or not funded. Please ensure it is created and funded.`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    res.status(500).json({ message: errorMessage, error: error.message });
  }
});

// --- API Endpoint to Fetch User's Wallet ---
app.get("/api/wallet/me", keycloak.protect(), async (req, res) => {
  try {
    const keycloakId = req.kauth.grant.access_token.content.sub;

    // First, get the internal user_id
    const userResult = await pool.query(
      "SELECT id FROM users WHERE keycloak_id = $1",
      [keycloakId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found in database." });
    }
    const userId = userResult.rows[0].id;

    // Then, fetch the wallet associated with that user_id
    const walletResult = await pool.query(
      "SELECT id, public_key, is_multi_sig, created_at FROM wallets WHERE user_id = $1",
      [userId]
    );

    if (walletResult.rows.length > 0) {
      res.json({
        message: "Wallet fetched successfully.",
        wallet: walletResult.rows[0],
      });
    } else {
      res.status(404).json({ message: "No wallet found for this user." });
    }
  } catch (error) {
    console.error("Error fetching wallet:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch wallet.", error: error.message });
  }
});

app.post(
  "/api/wallet/trust-bluedollar",
  keycloak.protect(),
  async (req, res) => {
    try {
      const keycloakId = req.kauth.grant.access_token.content.sub;

      // 1. Get the internal user_id
      const userResult = await pool.query(
        "SELECT id FROM users WHERE keycloak_id = $1",
        [keycloakId]
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: "User not found in database." });
      }
      const userId = userResult.rows[0].id;

      // 2. Fetch the user's wallet (public and encrypted secret key)
      const walletResult = await pool.query(
        "SELECT public_key, encrypted_secret_key FROM wallets WHERE user_id = $1",
        [userId]
      );
      if (walletResult.rows.length === 0) {
        return res.status(404).json({
          message:
            "No Stellar wallet found for this user. Please create one first.",
        });
      }
      const {
        public_key: userPublicKey,
        encrypted_secret_key: userEncryptedSecretKey,
      } = walletResult.rows[0];

      // 3. Decrypt the user's secret key
      const decryptedBytes = crypto.AES.decrypt(
        userEncryptedSecretKey,
        ENCRYPTION_SECRET
      );
      const userSecretKey = decryptedBytes.toString(crypto.enc.Utf8);

      // 4. Load the user's Keypair
      const userKeypair = Keypair.fromSecret(userSecretKey);

      // 5. Get the BLUEDOLLAR Issuer Public Key from .env
      const blueDollarIssuerPublicKey =
        process.env.BLUEDOLLAR_ISSUER_PUBLIC_KEY;
      if (!blueDollarIssuerPublicKey) {
        console.error(
          "BLUEDOLLAR_ISSUER_PUBLIC_KEY not found in environment variables."
        );
        return res
          .status(500)
          .json({ message: "BlueDollar issuer not configured on server." });
      }

      // 6. Define the BLUEDOLLAR asset
      const blueDollarAsset = new Asset(
        "BLUEDOLLAR",
        blueDollarIssuerPublicKey
      );

      // 7. Get the current account sequence number from Horizon
      const account = await server.loadAccount(userPublicKey);

      // 8. Build the ChangeTrust operation
      const trustOperation = Operation.changeTrust({
        asset: blueDollarAsset,
        limit: "922337203685.4775807", // Max limit, represents a very large number for trust
      });

      // 9. Build the transaction
      const transaction = new TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE, // Use BASE_FEE from StellarSdk
        networkPassphrase: network, // Use the 'network' constant from your friend's code
      })
        .addOperation(trustOperation)
        .setTimeout(30) // Set a timeout for the transaction
        .build();

      // 10. Sign the transaction with the user's secret key
      transaction.sign(userKeypair);

      // 11. Submit the transaction to Horizon
      console.log(`Submitting trustline transaction for ${userPublicKey}...`);
      const transactionResult = await server.submitTransaction(transaction);
      console.log("Trustline transaction successful:", transactionResult);

      res.status(200).json({
        message: `Trustline for BLUEDOLLAR established successfully for wallet ${userPublicKey}.`,
        transactionId: transactionResult.hash,
      });
    } catch (error) {
      console.error("Error establishing BLUEDOLLAR trustline:", error);
      let errorMessage = "Failed to establish trustline.";
      if (
        error.response &&
        error.response.data &&
        error.response.data.extras &&
        error.response.data.extras.result_codes
      ) {
        errorMessage = `Stellar Transaction Error: ${JSON.stringify(
          error.response.data.extras.result_codes
        )}`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      res.status(500).json({ message: errorMessage, error: error.message });
    }
  }
);

app.post(
  "/api/asset/issue-bluedollar",
  keycloak.protect(),
  async (req, res) => {
    try {
      const { recipientPublicKey, amount } = req.body; // Expect recipient's public key and amount in the request body

      if (
        !recipientPublicKey ||
        !amount ||
        isNaN(amount) ||
        parseFloat(amount) <= 0
      ) {
        return res.status(400).json({
          message: "Missing or invalid recipientPublicKey or amount.",
        });
      }

      // 1. Load Issuer Account Keypair from .env
      const blueDollarIssuerSecret = process.env.BLUEDOLLAR_ISSUER_SECRET;
      const blueDollarIssuerPublicKey =
        process.env.BLUEDOLLAR_ISSUER_PUBLIC_KEY;

      if (!blueDollarIssuerSecret || !blueDollarIssuerPublicKey) {
        console.error(
          "BLUEDOLLAR_ISSUER_SECRET or BLUEDOLLAR_ISSUER_PUBLIC_KEY not found in environment variables."
        );
        return res
          .status(500)
          .json({ message: "BlueDollar issuer not configured on server." });
      }

      const issuerKeypair = Keypair.fromSecret(blueDollarIssuerSecret);

      // Optional: Verify the provided issuer public key matches the secret key
      if (issuerKeypair.publicKey() !== blueDollarIssuerPublicKey) {
        console.warn(
          "Configured BLUEDOLLAR_ISSUER_PUBLIC_KEY does not match derived public key from BLUEDOLLAR_ISSUER_SECRET."
        );
        // You might want to return an error here in production
      }

      // 2. Define the BLUEDOLLAR asset
      const blueDollarAsset = new Asset(
        "BLUEDOLLAR",
        blueDollarIssuerPublicKey
      );

      // 3. Load the issuer account (to get the current sequence number)
      const issuerAccount = await server.loadAccount(issuerKeypair.publicKey());

      // 4. Build the Payment operation from Issuer to Recipient
      const paymentOperation = Operation.payment({
        destination: recipientPublicKey,
        asset: blueDollarAsset,
        amount: String(parseFloat(amount).toFixed(7)), // Stellar amounts are strings, typically 7 decimal places
      });

      // 5. Build the transaction
      const transaction = new TransactionBuilder(issuerAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: network,
      })
        .addOperation(paymentOperation)
        .setTimeout(30)
        .build();

      // 6. Sign the transaction with the Issuer's secret key
      transaction.sign(issuerKeypair);

      // 7. Submit the transaction to Horizon
      console.log(
        `Submitting BLUEDOLLAR issuance transaction to ${recipientPublicKey} for ${amount} BLUEDOLLAR...`
      );
      const transactionResult = await server.submitTransaction(transaction);
      console.log(
        "BLUEDOLLAR issuance transaction successful:",
        transactionResult
      );

      res.status(200).json({
        message: `${amount} BLUEDOLLAR issued to ${recipientPublicKey} successfully!`,
        transactionId: transactionResult.hash,
      });
    } catch (error) {
      console.error("Error issuing BLUEDOLLAR:", error);
      let errorMessage = "Failed to issue BLUEDOLLAR.";
      if (
        error.response &&
        error.response.data &&
        error.response.data.extras &&
        error.response.data.extras.result_codes
      ) {
        errorMessage = `Stellar Transaction Error: ${JSON.stringify(
          error.response.data.extras.result_codes
        )}`;
        // Common errors: "op_no_trust", "op_no_account" (recipient needs to exist), "op_underfunded" (issuer needs XLM)
      } else if (error.message) {
        errorMessage = error.message;
      }
      res.status(500).json({ message: errorMessage, error: error.message });
    }
  }
);

app.post("/api/wallet/send-asset", keycloak.protect(), async (req, res) => {
  try {
    const { destinationPublicKey, assetCode, amount } = req.body; // Recipient, asset code (e.g., 'BLUEDOLLAR', 'XLM'), and amount

    if (
      !destinationPublicKey ||
      !assetCode ||
      !amount ||
      isNaN(amount) ||
      parseFloat(amount) <= 0
    ) {
      return res.status(400).json({
        message:
          "Missing or invalid destinationPublicKey, assetCode, or amount.",
      });
    }

    const keycloakId = req.kauth.grant.access_token.content.sub;

    // 1. Get the internal user_id
    const userResult = await pool.query(
      "SELECT id FROM users WHERE keycloak_id = $1",
      [keycloakId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found in database." });
    }
    const userId = userResult.rows[0].id;

    // 2. Fetch the sender's wallet (public and encrypted secret key)
    const walletResult = await pool.query(
      "SELECT public_key, encrypted_secret_key FROM wallets WHERE user_id = $1",
      [userId]
    );
    if (walletResult.rows.length === 0) {
      return res.status(404).json({
        message:
          "No Stellar wallet found for the sender. Please create one first.",
      });
    }
    const {
      public_key: senderPublicKey,
      encrypted_secret_key: senderEncryptedSecretKey,
    } = walletResult.rows[0];

    // 3. Decrypt the sender's secret key
    const decryptedBytes = crypto.AES.decrypt(
      senderEncryptedSecretKey,
      ENCRYPTION_SECRET
    );
    const senderSecretKey = decryptedBytes.toString(crypto.enc.Utf8);

    // 4. Load the sender's Keypair
    const senderKeypair = Keypair.fromSecret(senderSecretKey);

    // 5. Determine the asset to send
    let assetToSend;
    if (assetCode.toUpperCase() === "XLM") {
      assetToSend = Asset.native(); // Represents Lumens
    } else if (assetCode.toUpperCase() === "BLUEDOLLAR") {
      const blueDollarIssuerPublicKey =
        process.env.BLUEDOLLAR_ISSUER_PUBLIC_KEY;
      if (!blueDollarIssuerPublicKey) {
        console.error(
          "BLUEDOLLAR_ISSUER_PUBLIC_KEY not found in environment variables."
        );
        return res
          .status(500)
          .json({ message: "BlueDollar issuer not configured on server." });
      }
      assetToSend = new Asset("BLUEDOLLAR", blueDollarIssuerPublicKey);
    } else {
      return res.status(400).json({
        message:
          "Unsupported assetCode. Only XLM and BLUEDOLLAR are supported.",
      });
    }

    // 6. Get the current account sequence number for the sender
    const senderAccount = await server.loadAccount(senderPublicKey);

    // 7. Build the Payment operation
    const paymentOperation = Operation.payment({
      destination: destinationPublicKey,
      asset: assetToSend,
      amount: String(parseFloat(amount).toFixed(7)), // Stellar amounts are strings, 7 decimal places
    });

    // 8. Build the transaction
    const transaction = new TransactionBuilder(senderAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: network,
    })
      .addOperation(paymentOperation)
      .setTimeout(30)
      .build();

    // 9. Sign the transaction with the sender's secret key
    transaction.sign(senderKeypair);

    // 10. Submit the transaction to Horizon
    console.log(
      `Submitting payment transaction for ${amount} ${assetCode} from ${senderPublicKey} to ${destinationPublicKey}...`
    );
    const transactionResult = await server.submitTransaction(transaction);
    console.log("Payment transaction successful:", transactionResult);

    res.status(200).json({
      message: `${amount} ${assetCode} sent successfully from ${senderPublicKey} to ${destinationPublicKey}!`,
      transactionId: transactionResult.hash,
    });
  } catch (error) {
    console.error("Error sending asset:", error);
    let errorMessage = "Failed to send asset.";
    if (
      error.response &&
      error.response.data &&
      error.response.data.extras &&
      error.response.data.extras.result_codes
    ) {
      errorMessage = `Stellar Transaction Error: ${JSON.stringify(
        error.response.data.extras.result_codes
      )}`;
      // Common errors: "op_no_trust" (destination needs trustline for custom asset),
      // "op_no_account" (destination account doesn't exist for XLM),
      // "op_underfunded" (sender doesn't have enough XLM for fees or asset for payment)
    } else if (error.message) {
      errorMessage = error.message;
    }
    res.status(500).json({ message: errorMessage, error: error.message });
  }
});

app.get("/api/wallet/transactions", keycloak.protect(), async (req, res) => {
  try {
    const keycloakId = req.kauth.grant.access_token.content.sub;

    // 1. Get the internal user_id
    const userResult = await pool.query(
      "SELECT id FROM users WHERE keycloak_id = $1",
      [keycloakId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found in database." });
    }
    const userId = userResult.rows[0].id;

    // 2. Fetch the user's wallet public key
    const walletResult = await pool.query(
      "SELECT public_key FROM wallets WHERE user_id = $1",
      [userId]
    );
    if (walletResult.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No Stellar wallet found for this user." });
    }
    const userPublicKey = walletResult.rows[0].public_key;

    // 3. Fetch transactions for the account from Horizon
    // We'll use the 'payments' endpoint as it's often more straightforward for simple transfers
    // You can also use .transactions() but then you'd need to parse operations within each transaction
    // .order('desc') gets the newest first
    // .limit(20) fetches up to 20 recent payments
    const payments = await server
      .payments()
      .forAccount(userPublicKey)
      .order("desc")
      .limit(20) // Limit to 20 most recent payments for display
      .call();

    const formattedTransactions = payments.records.map((record) => {
      let assetCode, assetIssuer, typeDescription, counterparty;

      if (record.type === "create_account") {
        typeDescription = "Account Creation";
        assetCode = "XLM"; // Account creation involves XLM
        counterparty = record.funder || record.source_account; // Who funded it
      } else if (record.type === "payment") {
        assetCode = record.asset_type === "native" ? "XLM" : record.asset_code;
        assetIssuer =
          record.asset_type === "native" ? null : record.asset_issuer;

        // Determine if it's an incoming or outgoing payment from the perspective of userPublicKey
        if (record.from === userPublicKey) {
          typeDescription = "Sent";
          counterparty = record.to;
        } else if (record.to === userPublicKey) {
          typeDescription = "Received";
          counterparty = record.from;
        } else {
          typeDescription = "Other Payment"; // Should not happen often if forAccount() is used correctly
          counterparty = "N/A";
        }
      } else if (record.type === "change_trust") {
        typeDescription = "Trustline Change";
        assetCode = record.asset_code;
        assetIssuer = record.asset_issuer;
        counterparty = record.trustor; // The account that changed trust (should be userPublicKey)
      } else {
        typeDescription = record.type; // Fallback for other operation types
        assetCode = record.asset_code || "N/A";
        assetIssuer = record.asset_issuer || "N/A";
        counterparty = record.source_account || "N/A";
      }

      return {
        id: record.id,
        type: record.type,
        typeDescription: typeDescription,
        sourceAccount: record.source_account, // The account that initiated the operation
        from: record.from || null, // For payment ops
        to: record.to || null, // For payment ops
        amount: record.amount || null, // For payment ops
        assetCode: assetCode,
        assetIssuer: assetIssuer,
        counterparty: counterparty, // Who the payment was to/from
        date: record.created_at,
        transactionHash: record.transaction_hash,
        // You can add more fields if needed, e.g., record.paging_token, record.transaction_memo
      };
    });

    res.status(200).json({
      message: `Transaction history for wallet ${userPublicKey} fetched successfully.`,
      public_key: userPublicKey,
      transactions: formattedTransactions,
    });
  } catch (error) {
    console.error("Error fetching wallet transactions:", error);
    let errorMessage = "Failed to fetch wallet transactions.";
    if (error.name === "NotFoundError") {
      errorMessage = `Stellar account ${userPublicKey} not found or not funded.`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    res.status(500).json({ message: errorMessage, error: error.message });
  }
});

//DEX OFFERS
app.post("/api/dex/create-offer", keycloak.protect(), async (req, res) => {
  const keycloakId = req.kauth.grant.access_token.content.sub; // This is the Keycloak UUID

  const {
    sellingAssetCode,
    sellingAssetIssuer,
    buyingAssetCode,
    buyingAssetIssuer,
    amount,
    price,
    offerId,
  } = req.body;

  try {
    // 1. Get the internal user_id from the 'users' table
    const userId = await getInternalUserId(keycloakId); // Use the helper function

    // 2. Validate inputs (existing logic)
    if (!sellingAssetCode || !buyingAssetCode || !amount || !price) {
      return res
        .status(400)
        .json({ message: "Missing required offer parameters." });
    }

    const amountStr = String(parseFloat(amount).toFixed(7));
    const priceStr = String(parseFloat(price));

    if (isNaN(parseFloat(amountStr)) || parseFloat(amountStr) <= 0) {
      return res.status(400).json({ message: "Invalid amount." });
    }
    if (isNaN(parseFloat(priceStr)) || parseFloat(priceStr) <= 0) {
      return res.status(400).json({ message: "Invalid price." });
    }

    const BLUEDOLLAR_ISSUER_PUBLIC_KEY =
      process.env.BLUEDOLLAR_ISSUER_PUBLIC_KEY; // Ensure this is loaded
    if (
      (sellingAssetCode === "BLUEDOLLAR" && !BLUEDOLLAR_ISSUER_PUBLIC_KEY) ||
      (buyingAssetCode === "BLUEDOLLAR" && !BLUEDOLLAR_ISSUER_PUBLIC_KEY)
    ) {
      return res.status(500).json({
        message: "BLUEDOLLAR issuer public key not configured on server.",
      });
    }

    const getAsset = (code, issuer) => {
      // Ensure this helper is defined globally or within scope
      if (code === "XLM") return StellarSdk.Asset.native();
      if (!issuer)
        throw new Error(`Issuer is required for non-XLM asset: ${code}`);
      return new StellarSdk.Asset(code, issuer);
    };

    const finalSellingAssetIssuer =
      sellingAssetCode === "BLUEDOLLAR"
        ? BLUEDOLLAR_ISSUER_PUBLIC_KEY
        : sellingAssetIssuer;
    const finalBuyingAssetIssuer =
      buyingAssetCode === "BLUEDOLLAR"
        ? BLUEDOLLAR_ISSUER_PUBLIC_KEY
        : buyingAssetIssuer;

    let sellingAsset;
    try {
      sellingAsset = getAsset(sellingAssetCode, finalSellingAssetIssuer);
    } catch (e) {
      return res
        .status(400)
        .json({ message: `Invalid selling asset: ${e.message}` });
    }

    let buyingAsset;
    try {
      buyingAsset = getAsset(buyingAssetCode, finalBuyingAssetIssuer);
    } catch (e) {
      return res
        .status(400)
        .json({ message: `Invalid buying asset: ${e.message}` });
    }

    // 3. Retrieve user's encrypted secret key from 'wallets' table using the internal userId
    // Change 'keycloak_id' to 'user_id' in the WHERE clause:
    const walletQuery = await pool.query(
      "SELECT encrypted_secret_key, public_key FROM wallets WHERE user_id = $1", // <-- CORRECTED HERE
      [userId] // <-- Use the internal userId
    );

    if (walletQuery.rows.length === 0) {
      return res.status(404).json({
        message:
          "Stellar wallet not found for this user. Please create one first.",
      });
    }

    const { encrypted_secret_key, public_key } = walletQuery.rows[0];

    // 4. Decrypt the secret key (existing logic)
    const decryptedSecretKey = crypto.AES.decrypt(
      encrypted_secret_key,
      ENCRYPTION_SECRET
    ).toString(crypto.enc.Utf8);

    const userKeypair = StellarSdk.Keypair.fromSecret(decryptedSecretKey);

    if (userKeypair.publicKey() !== public_key) {
      console.error("Mismatch between derived and stored public key!");
      return res
        .status(500)
        .json({ message: "Internal server error: Key mismatch." });
    }

    // 5. Load account from Horizon to get sequence number (existing logic)
    const account = await server.loadAccount(userKeypair.publicKey());

    // 6. Build the `manageSellOffer` transaction (existing logic)
    const operation = StellarSdk.Operation.manageSellOffer({
      selling: sellingAsset,
      buying: buyingAsset,
      amount: amountStr,
      price: priceStr,
      offerId: offerId || "0",
    });

    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase:
        process.env.STELLAR_NETWORK === "public"
          ? StellarSdk.Networks.PUBLIC
          : StellarSdk.Networks.TESTNET, // Corrected line
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    // 7. Sign and submit (existing logic)
    transaction.sign(userKeypair);
    const transactionResult = await server.submitTransaction(transaction);

    console.log("Offer creation transaction result:", transactionResult);
    res.status(200).json({
      message: "Offer created successfully!",
      transactionHash: transactionResult.hash,
      ledger: transactionResult.ledger,
    });
  } catch (error) {
    console.error("Error creating DEX offer:", error);
    let errorMessage = "Failed to create offer.";
    if (error.message.includes("User not found in internal database.")) {
      errorMessage = error.message; // Propagate specific user not found error
    } else if (
      error.response &&
      error.response.data &&
      error.response.data.extras
    ) {
      const resultCodes = error.response.data.extras.result_codes;
      if (
        resultCodes.operations &&
        resultCodes.operations.includes("op_offer_not_found")
      ) {
        errorMessage = "Offer not found or already cancelled.";
      } else if (
        resultCodes.operations &&
        resultCodes.operations.includes("op_no_trust")
      ) {
        errorMessage =
          "You need to establish a trustline to the asset you are buying or selling.";
      } else if (
        resultCodes.operations &&
        resultCodes.operations.includes("op_underfunded")
      ) {
        errorMessage =
          "Insufficient funds or minimum balance not met to cover transaction fees or offer amount.";
      } else if (
        resultCodes.transaction &&
        resultCodes.transaction.includes("tx_bad_auth")
      ) {
        errorMessage =
          "Authentication failed for transaction. Check wallet keys.";
      } else {
        errorMessage = `Stellar Transaction Error: ${JSON.stringify(
          resultCodes
        )}`;
      }
    } else if (error.message.includes("Invalid secret key")) {
      errorMessage = "Invalid wallet secret key stored for your account.";
    } else if (error.message) {
      errorMessage = error.message;
    }
    res.status(500).json({ message: errorMessage, error: error.message });
  }
});

app.get("/api/dex/my-offers", keycloak.protect(), async (req, res) => {
  try {
    const keycloakId = req.kauth.grant.access_token.content.sub;

    // 1. Get the internal user_id
    const userResult = await pool.query(
      "SELECT id FROM users WHERE keycloak_id = $1",
      [keycloakId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found in database." });
    }
    const userId = userResult.rows[0].id;

    // 2. Fetch the user's wallet public key
    const walletResult = await pool.query(
      "SELECT public_key FROM wallets WHERE user_id = $1",
      [userId]
    );
    if (walletResult.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No Stellar wallet found for this user." });
    }
    const userPublicKey = walletResult.rows[0].public_key;

    // 3. Fetch active sell offers for the account from Horizon
    // Use the .offers() endpoint which specifically lists sell offers
    const offers = await server
      .offers() // Pass public key to filter by account
      .forAccount(userPublicKey)
      .order("desc")
      .limit(100) // Adjust limit as needed, default is often 10
      .call();

    //   const offers = await server
    // .offers("accounts", userPublicKey) // Pass public key to filter by account
    // .order("desc")
    // .limit(100) // Adjust limit as needed, default is often 10
    // .call();

    const formattedOffers = offers.records.map((offer) => {
      // Determine asset codes and issuers for selling and buying
      const sellingAssetCode =
        offer.selling.asset_type === "native"
          ? "XLM"
          : offer.selling.asset_code;
      const sellingAssetIssuer =
        offer.selling.asset_type === "native"
          ? null
          : offer.selling.asset_issuer;

      const buyingAssetCode =
        offer.buying.asset_type === "native" ? "XLM" : offer.buying.asset_code;
      const buyingAssetIssuer =
        offer.buying.asset_type === "native" ? null : offer.buying.asset_issuer;

      return {
        id: offer.id, // The offer ID is crucial for cancelling/updating
        seller: offer.seller, // Should be the user's public key
        sellingAsset: {
          code: sellingAssetCode,
          issuer: sellingAssetIssuer,
        },
        buyingAsset: {
          code: buyingAssetCode,
          issuer: buyingAssetIssuer,
        },
        amount: offer.amount, // Amount of selling asset
        price: offer.price, // Price in terms of buying asset per unit of selling asset
        lastModifiedLedger: offer.last_modified_ledger,
        lastModifiedTime: offer.last_modified_time,
      };
    });

    res.status(200).json({
      message: `Active offers for wallet ${userPublicKey} fetched successfully.`,
      public_key: userPublicKey,
      offers: formattedOffers,
    });
  } catch (error) {
    console.error("Error fetching active offers:", error);
    let errorMessage = "Failed to fetch active offers.";
    if (error.name === "NotFoundError") {
      errorMessage = `Stellar account not found or no offers for ${userPublicKey}.`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    res.status(500).json({ message: errorMessage, error: error.message });
  }
});

app.post("/api/dex/cancel-offer", keycloak.protect(), async (req, res) => {
  try {
    const keycloakId = req.kauth.grant.access_token.content.sub;
    const {
      offerId,
      sellingAssetCode,
      sellingAssetIssuer,
      buyingAssetCode,
      buyingAssetIssuer,
    } = req.body;

    if (!offerId || !sellingAssetCode || !buyingAssetCode) {
      return res.status(400).json({
        message: "Missing offerId, sellingAssetCode, or buyingAssetCode.",
      });
    }

    // 1. Get the internal user_id
    const userResult = await pool.query(
      "SELECT id FROM users WHERE keycloak_id = $1",
      [keycloakId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found in database." });
    }
    const userId = userResult.rows[0].id;

    // 2. Fetch the user's wallet public and secret keys
    const walletResult = await pool.query(
      "SELECT public_key, encrypted_secret_key FROM wallets WHERE user_id = $1",
      [userId]
    );
    if (walletResult.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No Stellar wallet found for this user." });
    }
    const userPublicKey = walletResult.rows[0].public_key;
    const encryptedSecret = walletResult.rows[0].encrypted_secret_key;

    // Decrypt the secret key
    const decryptedSecret = crypto.AES.decrypt(
      encryptedSecret,
      ENCRYPTION_SECRET
    ).toString(crypto.enc.Utf8);
    const userKeypair = StellarSdk.Keypair.fromSecret(decryptedSecret);

    // 3. Get the account sequence number from Horizon
    const account = await server.loadAccount(userPublicKey);

    // 4. Define the selling and buying assets
    const sellingAsset = getAsset(sellingAssetCode, sellingAssetIssuer);
    const buyingAsset = getAsset(buyingAssetCode, buyingAssetIssuer);

    // 5. Create the manageSellOffer operation to cancel the offer
    // To cancel an offer, you create a new offer with amount 0 and the existing offer's ID.
    const operation = StellarSdk.Operation.manageSellOffer({
      selling: sellingAsset,
      buying: buyingAsset,
      amount: "0", // Amount 0 cancels the existing offer
      price: "1", // Price doesn't matter when amount is 0, but is required
      offerId: offerId, // The ID of the offer to cancel
    });

    // 6. Build the transaction
    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase:
        process.env.STELLAR_NETWORK === "public"
          ? StellarSdk.Networks.PUBLIC
          : StellarSdk.Networks.TESTNET,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    // 7. Sign the transaction
    transaction.sign(userKeypair);

    // 8. Submit the transaction to Horizon
    const transactionResult = await server.submitTransaction(transaction);

    res.status(200).json({
      message: `Offer ${offerId} cancelled successfully.`,
      transaction: transactionResult,
    });
  } catch (error) {
    console.error("Error cancelling offer:", error);
    let errorMessage = "Failed to cancel offer.";
    if (error.response && error.response.data && error.response.data.extras) {
      errorMessage = `Stellar Horizon Error: ${JSON.stringify(
        error.response.data.extras.result_codes
      )}`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    res.status(500).json({ message: errorMessage, error: error.message });
  }
});

app.get("/api/dex/orderbook", async (req, res) => {
  try {
    const {
      sellingAssetCode,
      sellingAssetIssuer,
      buyingAssetCode,
      buyingAssetIssuer,
    } = req.query;

    if (!sellingAssetCode || !buyingAssetCode) {
      return res
        .status(400)
        .json({ message: "Selling and buying asset codes are required." });
    }

    // Helper function to get Stellar Asset object (you might have this already)
    const getAsset = (code, issuer) => {
      if (code === "XLM") {
        return StellarSdk.Asset.native();
      }
      if (!issuer) {
        throw new Error(`Issuer is required for non-XLM asset: ${code}`);
      }
      return new StellarSdk.Asset(code, issuer);
    };

    const sellingAsset = getAsset(sellingAssetCode, sellingAssetIssuer);
    const buyingAsset = getAsset(buyingAssetCode, buyingAssetIssuer);

    // Fetch the order book from Horizon
    const orderbook = await server
      .orderbooks()
      .selling(sellingAsset)
      .buying(buyingAsset)
      .call();

    // The 'orderbook' object will contain 'bids' and 'asks' arrays
    // Each bid/ask will have 'price', 'amount', 'counter_amount', etc.

    res.status(200).json({
      message: `Order book for ${sellingAssetCode}/${buyingAssetCode} fetched successfully.`,
      sellingAsset: {
        code: sellingAssetCode,
        issuer: sellingAssetIssuer,
      },
      buyingAsset: {
        code: buyingAssetCode,
        issuer: buyingAssetIssuer,
      },
      bids: orderbook.bids, // Array of buy offers
      asks: orderbook.asks, // Array of sell offers
    });
  } catch (error) {
    console.error("Error fetching order book:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch order book.", error: error.message });
  }
});

async function createAndFundIssuerAccount() {
  try {
    // 1. Generate a new Keypair for the Issuer Account
    const issuerKeypair = Keypair.random();
    const issuerPublicKey = issuerKeypair.publicKey();
    const issuerSecretKey = issuerKeypair.secret();

    console.log("\n--- NEW BLUEDOLLAR ISSUER ACCOUNT ---");
    console.log("Issuer Public Key:", issuerPublicKey);
    console.log("Issuer Secret Key:", issuerSecretKey); // SECURE THIS!

    // 2. Fund the Issuer Account using Friendbot (Testnet only)
    console.log(
      `Attempting to fund BLUEDOLLAR Issuer Account: ${issuerPublicKey} on Testnet...`
    );
    const friendbotResponse = await server.friendbot(issuerPublicKey).call();
    console.log("Friendbot response for Issuer:", friendbotResponse);
    console.log(
      `BLUEDOLLAR Issuer Account ${issuerPublicKey} funded successfully!`
    );

    // --- IMPORTANT ---
    // STORE THESE KEYS SECURELY. For a real application, you might:
    // A) Store them encrypted in a dedicated database table (e.g., 'platform_wallets').
    // B) Use environment variables for the secret key (e.g., process.env.BLUEDOLLAR_ISSUER_SECRET).
    // For development, setting them in your .env file is a good start.
    console.log("\n--- ACTION REQUIRED ---");
    console.log("Add the Issuer Secret Key to your backend/.env file:");
    console.log(`BLUEDOLLAR_ISSUER_SECRET='${issuerSecretKey}'`);
    console.log(`BLUEDOLLAR_ISSUER_PUBLIC_KEY='${issuerPublicKey}'`);
    console.log("------------------------\n");

    return { publicKey: issuerPublicKey, secretKey: issuerSecretKey };
  } catch (error) {
    console.error(
      "Error creating and funding BLUEDOLLAR Issuer Account:",
      error
    );
    if (error.response && error.response.data) {
      console.error("Horizon Error:", error.response.data);
    }
    return null;
  }
}
async function getInternalUserId(keycloakId) {
  const userResult = await pool.query(
    "SELECT id FROM users WHERE keycloak_id = $1",
    [keycloakId]
  );
  if (userResult.rows.length === 0) {
    throw new Error("User not found in internal database.");
  }
  return userResult.rows[0].id; // This is the UUID from the 'users' table
}
// createAndFundIssuerAccount();
// Start the server (Existing)
app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
  console.log(`Keycloak connected to realm: ${keycloakConfig.realm}`);
});

// Export the pool for use in other modules if you separate routes/logic
export {
  pool,
  server, // Export the `server` instance from the new config
  network, // Export `network`
  Keypair, // Export `Keypair` (already destructured)
  Asset,
  TransactionBuilder,
  Operation,
  Memo,
};
