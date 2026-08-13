# OpsHUB Web App

**Developed by TechCraft by Chano**

OpsHUB is a comprehensive, centralized internal operations and HR management system designed to streamline administrative workflows. It modernizes tracking, scheduling, and evaluations by moving them from manual spreadsheets to a fully automated digital workspace.

## 🚀 Key Features

*   **Role-Based Access Control (RBAC):** Secure authentication powered by Clerk, featuring strict permissions for Super Admins, Admins, HR Designates, and standard users.
*   **Digital Logbook & DTR:** Seamless daily time record tracking for employees with real-time status monitoring.
*   **Leave Management System:** End-to-end leave tracking including automated monthly accruals (VL/SL) and yearly resets for special leave types using serverless cron jobs.
*   **COSW Evaluations:** A dedicated, responsive module for evaluating Contract of Service Workers, generating printable records and managing performance data.
*   **Centralized Scheduling:** Combined Office Activities and Personal Calendars with automated 24-hour email reminders via Nodemailer.
*   **Cloud Storage Integration:** Secure document and signature uploads utilizing AWS S3/Cloudflare R2 for fast retrieval and signed URLs.

## 🛠️ Tech Stack

*   **Frontend:** React (Vite), TailwindCSS, React Router
*   **Backend:** Node.js (Serverless API routes on Vercel)
*   **Database:** Turso (Edge SQLite)
*   **Authentication:** Clerk
*   **Storage:** Cloudflare R2 / AWS S3

## 👨‍💻 Developer

Built with ❤️ by **TechCraft by Chano**
