# Quantifying Knowledge Transfer in AI 

This repository contains the user interface, datasets, (filtered) interaction trajectories, and analysis code for the paper: "When Models Know More Than They Can Explain: Quantifying Knowledge Transfer in Human-AI Collaboration." by Quan Shi, Carlos E. Jimenez, Shunyu Yao, Nick Haber, Diyi Yang, and Karthik Narasimhan.

For a preview, navigate to [https://codeht.vercel.app](https://codeht.vercel.app).

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v16 or newer recommended)
- npm (comes with Node.js) or [pnpm](https://pnpm.io/)

## Installation

1. Clone the repository:
   ```
   git clone [repository-url]
   cd ai-tutor-app
   ```

2. Install dependencies:
   ```
   npm install
   ```
   or with pnpm:
   ```
   pnpm install
   ```

## Firebase Configuration

This application uses Firebase for authentication and database services. You need to configure Firebase before running the app:

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Set up Authentication with Email/Password provider
3. Set up Firestore Database
4. Update the Firebase configuration in `src/firebase/firebase.js` with your project credentials

## Running the Application

To start the development server:

```
npm start
```

This will run the app in development mode. Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will automatically reload when you make changes to the code.

## Building for Production

To create a production build:

```
npm run build
```

This builds the app for production to the `build` folder. The build is minified and optimized for best performance.

## Features

- Interactive chat interface for problem-solving
- User authentication system
- Problem lists organized by categories
- Progress tracking
