# eSell - Premium Resell Marketplace

eSell is a modern, full-featured marketplace application where users can buy and sell products. It features real-time chat, user profiles, and a secure admin portal. Built with React (Vite) and Supabase.

![eSell Banner](https://via.placeholder.com/800x400.png?text=eSell+Marketplace)

## ✨ Features

-   **🛍️ Buy & Sell**: Users can list items with images and browse distinct categories.
-   **💬 Real-time Chat**: Integrated messaging system allows buyers and sellers to communicate instantly.
-   **🔐 Authentication**: Secure Email/Password login, registration, and password recovery via Supabase Auth.
-   **👤 User Profiles**: Users have public profiles showing their active listings.
-   **🛡️ Admin Portal**: Dedicated dashboard for admins to view stats, manage users, and moderate content.
-   **🎨 Premium UI**: Glassmorphism design system with responsive layouts and smooth animations.

## 🛠️ Tech Stack

-   **Frontend**: React.js, Vite
-   **Styling**: Vanilla CSS (Variables, Flexbox/Grid), Glassmorphism effects
-   **Backend/Database**: Supabase (PostgreSQL)
-   **Authentication**: Supabase Auth
-   **Storage**: Supabase Storage (product images)
-   **Icons**: Phosphor Icons

## 🚀 Getting Started

### Prerequisites

-   Node.js (v16+)
-   A Supabase Project

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/Arya-126/esell.git
    cd esell
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Environment Setup**
    Create a `.env` file in the root directory:
    ```env
    VITE_SUPABASE_URL=your_supabase_project_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    ```

4.  **Database Setup**
    Run the SQL scripts located in your project root using the Supabase SQL Editor:
    -   `supabase_schema.sql`: Sets up tables (Profiles, Products, Chats, Messages) and RLS policies.
    -   `setup_triggers.sql`: Sets up auto-creation of user profiles.
    -   `admin_update.sql`: Adds admin role capabilities.

5.  **Run the application**
    ```bash
    npm run dev
    ```

## 🛡️ Admin Access

To access the Admin Portal:
1.  Sign up for an account in the app.
2.  Go to your Supabase SQL Editor and run:
    ```sql
    select make_admin('YOUR_USER_UUID');
    ```
3.  Refresh the app. You will see an **ADMIN** badge in the navbar.

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
