import { render } from "preact";
import { App } from "./app";
import { installSplash } from "./splash";
import "./styles.css";

const root = document.getElementById("root")!;
render(<App />, root);
installSplash();
