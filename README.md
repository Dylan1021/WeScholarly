# WeScholarly

A personal dashboard to track WeChat Official Accounts and generate daily AI summaries for academic articles using Gemini.

## Features

- **Track Accounts**: Search and add WeChat Official Accounts.
- **Daily Briefing**: One-click generation of yesterday's article summaries.
- **Smart Filtering**: Filter articles by keywords to focus on your research interests using Google Gemini.
- **Local Data**: Accounts are stored in a local SQLite database (`app.db`).

## Prerequisites

- [Node.js](https://nodejs.org/) (Version 18 or higher recommended)
- npm (comes with Node.js)

## Configuration

The app comes pre-configured with default API keys in `src/App.tsx`.
- **MPText Key**: Used to fetch WeChat articles from [wechat-article-exporter](https://down.mptext.top/dashboard/api)
- **Gemini Key**: Used for AI summarization.

You can change these in the "Settings" tab of the application, or modify `src/App.tsx` directly if you want to change the defaults permanently.

## Installation

1.  **Download the code**: Download all files from the project to a folder on your computer.
2.  **Open a terminal**: Navigate to the project folder.
3.  **Install dependencies**:
    ```bash
    npm install
    ```

## Running the App

### Development Mode
To run the app with hot-reloading (best for making changes):

```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Mode
To build and run the optimized version:

```bash
npm run build
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

## Troubleshooting

- **Database Issues**: If you encounter issues with `better-sqlite3`, you might need to rebuild it: `npm rebuild better-sqlite3`.
- **Port In Use**: If port 3000 is busy, modify `PORT` in `server.ts`.

Hope you enjoy it!
