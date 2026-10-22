import {createContext} from "react";
import type {AiChatState,AiSearchChat} from "../lib/aiSearchHistory";
export const AiSearchHistoryContext=createContext<{chat:AiSearchChat|null;title:string;save:(state:AiChatState)=>void;newChat:()=>void;openHistory:()=>void;historyOpen:boolean;historyId:string}|null>(null);
