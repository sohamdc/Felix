# Stellar Wallet & DEX Application
This project is a **Stellar Wallet & DEX app**. Its Node.js backend integrates with the Stellar blockchain for wallet creation, asset transfers, transaction history, and decentralized exchange (DEX) offers. It uses PostgreSQL for data storage and Keycloak for authentication and authorization, with planned user and group management.

## ✨ Features

* **Secure User Authentication:** Leverages Keycloak for robust identity and access management.
* **Role-Based Access Control (RBAC):** Protects backend API endpoints based on user roles.
* **Stellar Wallet Creation:** Allows users to generate and fund new Stellar accounts (Testnet via Friendbot).
* **Wallet Management:** View account details, asset balances (XLM and custom assets), and transaction history.
* **Asset Transfers:** Send XLM and custom assets to other Stellar public keys.
* **Stellar DEX Integration:**
    * Create new buy and sell offers on the Stellar Decentralized Exchange.
    * View and manage (cancel) active DEX offers.
* **Encrypted Wallet Storage:** Securely stores user's Stellar secret keys in the database using encryption.
* **PostgreSQL Database:** Utilizes a PostgreSQL database (compatible with Supabase) for persistent data storage.
* **(Planned) User & Group Management:** Backend foundation for interacting with Keycloak Admin API to manage users and groups programmatically.

## 🚀 Technologies Used

**Backend:**
* [Node.js](https://nodejs.org/): JavaScript runtime
* [Express.js](https://expressjs.com/): Web application framework
* [PostgreSQL](https://www.postgresql.org/) / [Supabase](https://supabase.com/): Database
* [`pg`](https://node-postgres.com/): PostgreSQL client for Node.js
* [`@stellar/stellar-sdk`](https://stellar.github.io/js-stellar-sdk/): Stellar SDK for JavaScript
* [`crypto-js`](https://github.com/brix/crypto-js): Cryptographic algorithms
* [`keycloak-connect`](https://www.keycloak.org/docs/latest/securing_apps/index.html#_nodejs_adapter): Keycloak adapter for Node.js Express
* [`axios`](https://axios-http.com/): Promise-based HTTP client

**Frontend:**
* [React.js](https://react.dev/): JavaScript library for building user interfaces
* [Vite](https://vitejs.dev/): Next-generation frontend tooling
* [`react-router-dom`](https://reactrouter.com/): Declarative routing for React
* [`keycloak-js`](https://www.keycloak.org/docs/latest/securing_apps/index.html#_javascript_adapter): Keycloak JavaScript adapter
* [`qrcode.react`](https://github.com/zpao/qrcode.react): React component for QR codes
* [Tailwind CSS](https://tailwindcss.com/) (Recommended for UI styling)

## ⚙️ Prerequisites

Before you begin, ensure you have the following installed:

* [Node.js](https://nodejs.org/en/download/) (v18.x or higher recommended)
* [npm](https://www.npmjs.com/get-npm) or [Yarn](https://yarnpkg.com/lang/en/docs/install/)
* [PostgreSQL](https://www.postgresql.org/download/) (or a cloud provider like Supabase)
* [Keycloak](https://www.keycloak.org/downloads) (standalone server, Docker, or cloud instance)

## 🚀 Setup & Installation

Follow these steps to get the project up and running on your local machine.

### 1. Keycloak Server Setup

1.  **Start Keycloak:** Run your Keycloak server (e.g., via Docker: `docker run -p 8080:8080 -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN_PASSWORD=admin quay.io/keycloak/keycloak:latest start-dev`).
2.  **Create a Realm:**
    * Access Keycloak Admin Console (`http://localhost:8080`).
    * Create a new realm (e.g., `felix-realm`).
3.  **Create Clients:**
    * **`felix-frontend-client`**:
        * Access Type: `public`
        * Standard Flow Enabled: `ON`
        * Valid Redirect URIs: `http://localhost:5173/*`
        * Web Origins: `http://localhost:5173`
    * **`felix-backend-client`**:
        * Access Type: `confidential`
        * Service Accounts Enabled: `ON`
        * (Go to "Credentials" tab and note down the `Secret` - you'll need this for `backend/.env`)
    * **`admin-cli` (or a custom admin client)**:
        * This client is typically pre-configured in the `master` realm. If you create a custom one, ensure it's `confidential` and has `Service Accounts Enabled`. You'll need its secret for backend admin operations.
4.  **Create Roles:**
    * In `felix-realm` -> Roles, create a `user` role and an `admin` role.
5.  **Create Users:**
    * In `felix-realm` -> Users, create a test user.
    * Assign the `user` role to this user.
    * For testing admin functionalities, create another user and assign them the `admin` role.

### 2. Database Setup (PostgreSQL/Supabase)

Ensure your PostgreSQL database is running and accessible. If using Supabase, you'll find your connection details there.

**Create Tables:** Execute the following SQL schema to create the necessary tables:

```sql
-- Create the 'users' table
CREATE TABLE public.users (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    keycloak_id uuid NOT NULL,
    username character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    display_name character varying(255) NULL,
    created_at timestamp with time zone NULL DEFAULT now(),
    updated_at timestamp with time zone NULL DEFAULT now(),
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_keycloak_id_key UNIQUE (keycloak_id),
    CONSTRAINT users_username_key UNIQUE (username)
) TABLESPACE pg_default;

-- Create the 'wallets' table
CREATE TABLE public.wallets (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    user_id uuid NOT NULL,
    public_key character varying(56) NOT NULL,
    encrypted_secret_key text NOT NULL,
    is_multi_sig boolean NULL DEFAULT false,
    created_at timestamp with time zone NULL DEFAULT now(),
    updated_at timestamp with time zone NULL DEFAULT now(),
    CONSTRAINT wallets_pkey PRIMARY KEY (id),
    CONSTRAINT wallets_public_key_key UNIQUE (public_key),
    CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Create index for user_id in wallets table for faster lookups
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets USING btree (user_id) TABLESPACE pg_default;
