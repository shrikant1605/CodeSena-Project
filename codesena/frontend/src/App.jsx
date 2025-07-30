import { useState } from "react";

export default function App() {
  const [dark, setDark] = useState(false);

  return (
    <div className={dark ? "dark bg-gray-900 min-h-screen" : "bg-white min-h-screen"}>
      <div className="max-w-2xl mx-auto py-16 px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600 dark:text-blue-400">CodeSena</h1>
          <button
            className="px-4 py-2 rounded bg-blue-600 text-white dark:bg-blue-400 dark:text-gray-900"
            onClick={() => setDark((d) => !d)}
          >
            {dark ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Student-driven, tech-first community</h2>
        <p className="mb-6 text-gray-700 dark:text-gray-300">
          Every learner — beginner to advanced — grows through collaboration, mentorship, and real-world projects.
        </p>
        <ul className="list-disc pl-6 text-gray-800 dark:text-gray-200 mb-6">
          <li>Learn together</li>
          <li>Build together</li>
          <li>Grow together</li>
        </ul>
        <p className="text-blue-700 dark:text-blue-300 font-medium">Whether you're just starting out or already an expert — there's always room to contribute, learn, and get better at what you do.</p>
      </div>
    </div>
  );
}
