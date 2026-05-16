/**
 * =============================================================================
 * Chat Widget JavaScript — Frontend for the RAG Chatbot
 * =============================================================================
 *
 * RAG Architecture Note (Frontend Perspective):
 *
 * The frontend chat widget communicates with the backend RAG pipeline via REST:
 *
 *   1. On page load: GET /api/chat/starters → displays context-aware suggestions
 *   2. On message send: POST /api/chat → sends user question, receives RAG answer
 *
 * The widget detects the current page context (books list, book detail, home)
 * from the URL and passes it to the backend so the RAG system can tailor
 * its retrieval and response.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // STATE
    // =========================================================================
    let isOpen = false;
    let isLoading = false;

    // =========================================================================
    // CONTEXT DETECTION — Determine what page the user is on
    // =========================================================================

    /**
     * Analyzes the current URL to determine pageType and bookTitle.
     * This context is sent to the backend for context-aware starters and answers.
     */
    function detectPageContext() {
        const path = window.location.pathname;

        // Book detail page: /books/{title}
        // But NOT /books/add or /books/{title}/edit
        if (/^\/books\/[^/]+$/.test(path) && !path.endsWith('/add')) {
            const segments = path.split('/');
            const bookTitle = decodeURIComponent(segments[segments.length - 1]);
            return { pageType: 'book', bookTitle: bookTitle };
        }

        // Books list page: /books or /books?username=...
        if (path === '/books' || path === '/books/') {
            return { pageType: 'books', bookTitle: null };
        }

        // Default: home or any other page
        return { pageType: 'home', bookTitle: null };
    }

    // =========================================================================
    // DOM REFERENCES
    // =========================================================================
    const toggleBtn = document.getElementById('chat-toggle-btn');
    const chatWindow = document.getElementById('chat-window');
    const messagesDiv = document.getElementById('chat-messages');
    const startersDiv = document.getElementById('chat-starters');
    const inputField = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');

    // =========================================================================
    // TOGGLE OPEN/CLOSE
    // =========================================================================
    toggleBtn.addEventListener('click', function () {
        isOpen = !isOpen;
        chatWindow.classList.toggle('chat-visible', isOpen);
        toggleBtn.classList.toggle('chat-open', isOpen);

        // Change icon between chat bubble and X
        toggleBtn.innerHTML = isOpen ? '✕' : '💬';

        // Load starters when first opened
        if (isOpen && startersDiv.children.length === 0 && messagesDiv.children.length === 0) {
            loadStarters();
        }

        if (isOpen) {
            setTimeout(() => inputField.focus(), 350);
        }
    });

    // =========================================================================
    // LOAD CONVERSATION STARTERS
    // =========================================================================
    function loadStarters() {
        const ctx = detectPageContext();
        let url = '/api/chat/starters?pageType=' + encodeURIComponent(ctx.pageType);
        if (ctx.bookTitle) {
            url += '&bookTitle=' + encodeURIComponent(ctx.bookTitle);
        }

        fetch(url)
            .then(res => res.json())
            .then(starters => {
                startersDiv.innerHTML = '';
                starters.forEach(text => {
                    const btn = document.createElement('button');
                    btn.className = 'chat-starter-btn';
                    btn.textContent = text;
                    btn.addEventListener('click', () => {
                        sendMessage(text);
                        startersDiv.style.display = 'none';
                    });
                    startersDiv.appendChild(btn);
                });
            })
            .catch(err => console.error('Failed to load starters:', err));
    }

    // =========================================================================
    // SEND MESSAGE
    // =========================================================================
    sendBtn.addEventListener('click', () => {
        const text = inputField.value.trim();
        if (text) sendMessage(text);
    });

    inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const text = inputField.value.trim();
            if (text) sendMessage(text);
        }
    });

    /**
     * Sends a message through the RAG pipeline:
     * 1. Display user message in the chat
     * 2. POST to /api/chat with the question + page context
     * 3. Display the assistant's RAG-generated answer
     */
    function sendMessage(text) {
        if (isLoading) return;

        // Hide starters after first message
        startersDiv.style.display = 'none';

        // Show user message bubble
        appendMessage('user', text);
        inputField.value = '';

        // Show typing indicator
        isLoading = true;
        sendBtn.disabled = true;
        const typingEl = showTypingIndicator();

        // Build request payload with page context
        const ctx = detectPageContext();
        const payload = {
            message: text,
            pageType: ctx.pageType,
            bookTitle: ctx.bookTitle
        };

        // POST to the RAG chat endpoint
        fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(res => res.json())
            .then(data => {
                removeTypingIndicator(typingEl);
                appendAssistantMessage(data.answer, data.retrievedChunks);
            })
            .catch(err => {
                console.error('Chat error:', err);
                removeTypingIndicator(typingEl);
                appendMessage('assistant', 'Sorry, something went wrong. Please try again.');
            })
            .finally(() => {
                isLoading = false;
                sendBtn.disabled = false;
            });
    }

    // =========================================================================
    // MESSAGE RENDERING
    // =========================================================================

    /**
     * Appends a simple text message bubble.
     */
    function appendMessage(role, text) {
        const div = document.createElement('div');
        div.className = 'chat-msg ' + role;
        div.textContent = text;
        messagesDiv.appendChild(div);
        scrollToBottom();
    }

    /**
     * Appends an assistant message with optional "Show retrieved chunks" toggle.
     * This makes the RAG pipeline transparent for demo/presentation purposes.
     */
    function appendAssistantMessage(answer, chunks) {
        const wrapper = document.createElement('div');
        wrapper.style.alignSelf = 'flex-start';
        wrapper.style.maxWidth = '85%';

        // Answer bubble
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-msg assistant';
        msgDiv.style.maxWidth = '100%';
        msgDiv.textContent = answer;
        wrapper.appendChild(msgDiv);

        // "Show retrieved chunks" toggle (RAG transparency)
        if (chunks && chunks.length > 0) {
            const toggle = document.createElement('span');
            toggle.className = 'chat-chunks-toggle';
            toggle.textContent = '📎 Show retrieved chunks (' + chunks.length + ')';

            const chunksList = document.createElement('div');
            chunksList.className = 'chat-chunks-list';
            chunks.forEach((chunk, i) => {
                const p = document.createElement('p');
                p.style.margin = '0 0 4px 0';
                p.textContent = (i + 1) + '. ' + chunk;
                chunksList.appendChild(p);
            });

            toggle.addEventListener('click', () => {
                chunksList.classList.toggle('visible');
                toggle.textContent = chunksList.classList.contains('visible')
                    ? '📎 Hide retrieved chunks'
                    : '📎 Show retrieved chunks (' + chunks.length + ')';
            });

            wrapper.appendChild(toggle);
            wrapper.appendChild(chunksList);
        }

        messagesDiv.appendChild(wrapper);
        scrollToBottom();
    }

    // =========================================================================
    // TYPING INDICATOR
    // =========================================================================
    function showTypingIndicator() {
        const el = document.createElement('div');
        el.className = 'chat-typing';
        el.innerHTML = '<span></span><span></span><span></span>';
        messagesDiv.appendChild(el);
        scrollToBottom();
        return el;
    }

    function removeTypingIndicator(el) {
        if (el && el.parentNode) {
            el.parentNode.removeChild(el);
        }
    }

    // =========================================================================
    // UTILITIES
    // =========================================================================
    function scrollToBottom() {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
})();
