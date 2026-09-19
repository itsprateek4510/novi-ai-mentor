import { createRoot } from "react-dom/client";
import "../static/styles.css";
import App from "./App";
import { bootAppearance } from "./api";

bootAppearance();

createRoot(document.getElementById("root")).render(<App />);