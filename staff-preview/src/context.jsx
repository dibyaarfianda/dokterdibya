import { createContext } from "preact";
import { useContext } from "preact/hooks";
export const DemoContext = createContext(null);
export const useDemo = () => useContext(DemoContext);
