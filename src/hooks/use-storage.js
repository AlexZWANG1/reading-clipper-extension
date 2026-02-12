import { useState, useEffect } from 'react';

const STORAGE_KEYS = {
    MODE: "readingMode",
    TOPIC: "readingTopicTitle"
};

export function useStorage() {
    const [mode, setMode] = useState("free");
    const [topicTitle, setTopicTitle] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check if chrome.storage is available (dev mode fallback)
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
            chrome.storage.sync.get([STORAGE_KEYS.MODE, STORAGE_KEYS.TOPIC], (result) => {
                setMode(result[STORAGE_KEYS.MODE] || "free");
                setTopicTitle(result[STORAGE_KEYS.TOPIC] || "");
                setLoading(false);
            });
        } else {
            console.warn("chrome.storage not available, using mock data");
            setLoading(false);
        }
    }, []);

    const saveSettings = async (newMode, newTopic) => {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                chrome.storage.sync.set({
                    [STORAGE_KEYS.MODE]: newMode,
                    [STORAGE_KEYS.TOPIC]: newTopic || null
                }, () => {
                    setMode(newMode);
                    setTopicTitle(newTopic || "");
                    resolve();
                });
            } else {
                console.log("Mock save:", { newMode, newTopic });
                setMode(newMode);
                setTopicTitle(newTopic || "");
                resolve();
            }
        });
    };

    return { mode, topicTitle, loading, saveSettings };
}
