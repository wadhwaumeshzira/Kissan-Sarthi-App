// Send the user back to the login page if their session has expired
const originalFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 401 && !String(args[0]).startsWith('/api/auth/')) {
        window.location.href = '/login';
    }
    return response;
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

// Translate a key for text built in JS, with {placeholders}
function t(key, vars = {}) {
    const lang = (typeof translations !== 'undefined' && translations[window.globalLang]) || {};
    let text = lang[key] || (translations.en && translations.en[key]) || key;
    Object.entries(vars).forEach(([k, v]) => { text = text.replace(`{${k}}`, v); });
    return text;
}

document.addEventListener('DOMContentLoaded', () => {
    // Global Language State (shared with the login page)
    window.globalLang = 'en';
    try { window.globalLang = localStorage.getItem('ks-lang') || 'en'; } catch (e) {}
    const langSelect = document.getElementById('global-language');
    const homeLangSelect = document.getElementById('home-language');

    // Function to translate UI elements
    function updateTranslations(lang) {
        if (!translations || !translations[lang]) return;
        
        const texts = document.querySelectorAll('[data-i18n]');
        texts.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang][key]) {
                if (el.tagName === 'H1' || el.tagName === 'H2' || el.tagName === 'H3' || el.tagName === 'P' || el.tagName === 'SPAN') {
                    el.innerText = translations[lang][key];
                } else {
                    el.innerText = translations[lang][key];
                }
            }
        });

        const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
        placeholders.forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (translations[lang][key]) {
                el.placeholder = translations[lang][key];
            }
        });
        
        // Keep both selectors in sync
        if (langSelect) langSelect.value = lang;
        if (homeLangSelect) homeLangSelect.value = lang;
    }

    function changeLanguageHandler(e) {
        window.globalLang = e.target.value;
        try { localStorage.setItem('ks-lang', window.globalLang); } catch (err) {}
        updateTranslations(window.globalLang);
        if (window.renderPlans) window.renderPlans();
        if (window.renderSchemeNeeds) window.renderSchemeNeeds();
    }

    // --- Logout ---
    document.querySelectorAll('.logout-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/login';
        });
    });

    if (langSelect) langSelect.addEventListener('change', changeLanguageHandler);
    if (homeLangSelect) homeLangSelect.addEventListener('change', changeLanguageHandler);
    
    updateTranslations(window.globalLang);

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    const previewImage = document.getElementById('preview-image');
    const uploadContent = document.querySelector('.upload-content');
    
    const predictBtn = document.getElementById('predict-btn');
    const clearBtn = document.getElementById('clear-btn');
    
    const loader = document.getElementById('loader');
    const resultsSection = document.getElementById('results');
    const predictionCard = document.getElementById('prediction-card');
    const resultIcon = document.getElementById('result-icon');
    const predictionText = document.getElementById('prediction-text');
    const remediesList = document.getElementById('remedies-list');
    const fertilizersList = document.getElementById('fertilizers-list');

    let currentFile = null;

    // --- Drag and Drop Logic ---
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    browseBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering dropzone click
        fileInput.click();
    });

    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    function handleFile(file) {
        if (!file.type.match('image.*')) {
            alert('Please select an image file (JPG, PNG).');
            return;
        }

        currentFile = file;
        predictBtn.disabled = false;
        clearBtn.style.display = 'inline-flex';
        
        // Hide results if showing
        resultsSection.style.display = 'none';

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewImage.style.display = 'block';
            uploadContent.style.opacity = '0'; // Hide text behind image
        };
        reader.readAsDataURL(file);
    }

    clearBtn.addEventListener('click', () => {
        currentFile = null;
        fileInput.value = '';
        previewImage.style.display = 'none';
        uploadContent.style.opacity = '1';
        predictBtn.disabled = true;
        clearBtn.style.display = 'none';
        resultsSection.style.display = 'none';
    });

    // --- Prediction Logic ---
    predictBtn.addEventListener('click', async () => {
        if (!currentFile) return;

        // UI updates
        predictBtn.disabled = true;
        loader.style.display = 'flex';
        resultsSection.style.display = 'none';

        const formData = new FormData();
        formData.append('image', currentFile);
        formData.append('language', window.globalLang);

        try {
            const response = await fetch('/api/predict', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to predict disease');
            }

            displayResults(data);

        } catch (error) {
            console.error('Error:', error);
            alert('Error analyzing image: ' + error.message);
        } finally {
            loader.style.display = 'none';
            predictBtn.disabled = false;
        }
    });

    function displayResults(data) {
        // Set styling based on healthy vs diseased
        predictionCard.className = 'prediction-card';
        if (data.is_healthy) {
            predictionCard.classList.add('healthy');
            resultIcon.className = 'ph ph-check-circle';
        } else {
            predictionCard.classList.add('disease');
            resultIcon.className = 'ph ph-warning-circle';
        }

        // Set text
        predictionText.textContent = data.translated_prediction || data.prediction;
        resultsSection.dataset.lang = data.translated_prediction ? window.globalLang : 'en';

        // Populate Remedies
        remediesList.innerHTML = '';
        data.remedies.forEach(remedy => {
            const li = document.createElement('li');
            li.textContent = remedy;
            remediesList.appendChild(li);
        });

        // Populate Fertilizers
        fertilizersList.innerHTML = '';
        data.fertilizers.forEach(fertilizer => {
            const li = document.createElement('li');
            li.textContent = fertilizer;
            fertilizersList.appendChild(li);
        });

        // Show section
        resultsSection.style.display = 'flex';
        
        // Scroll to results
        setTimeout(() => {
            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }

    // --- Tab Navigation Logic ---
    const navLinks = document.querySelectorAll('.nav-links li');
    const sections = document.querySelectorAll('.tab-section');
    const sidebar = document.querySelector('.sidebar');

    function switchTab(targetId) {
        // Update active link
        navLinks.forEach(nav => nav.classList.remove('active'));
        const targetLink = document.querySelector(`.nav-links li[data-target="${targetId}"]`);
        if (targetLink) targetLink.classList.add('active');
        
        // Update active section visibility
        sections.forEach(section => {
            section.style.display = section.id === targetId ? 'block' : 'none';
        });
        
        // Hide sidebar on home page
        if (targetId === 'home-section') {
            sidebar.style.display = 'none';
        } else {
            sidebar.style.display = 'flex';
        }

        if (targetId === 'history-section' && window.loadHistory) {
            window.loadHistory();
        }
        if (targetId === 'home-section' && window.loadPlans) {
            window.loadPlans();
        }
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            if (targetId) switchTab(targetId);
        });
    });

    // Home Page Feature Cards Navigation
    const featureCards = document.querySelectorAll('.feature-card');
    featureCards.forEach(card => {
        card.addEventListener('click', () => {
            const targetId = card.getAttribute('data-link');
            if (targetId) switchTab(targetId);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    // Make sure initial state is correct (only active section is block)
    const initialActive = document.querySelector('.tab-section.active') || sections[0];
    if (initialActive) {
        switchTab(initialActive.id);
    }

    // --- Chat Assistant Logic ---
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatBox = document.getElementById('chat-box');
    const voiceBtn = document.getElementById('chat-voice-btn');
    const imgBtn = document.getElementById('chat-img-btn');
    const chatFileInput = document.getElementById('chat-file-input');
    const previewArea = document.getElementById('chat-preview-area');
    const imgPreview = document.getElementById('chat-img-preview');
    const removeImgBtn = document.getElementById('remove-chat-img');

    let selectedChatFile = null;

    // Speech Recognition Setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            voiceBtn.classList.add('listening');
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            chatInput.value += (chatInput.value ? ' ' : '') + transcript;
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            voiceBtn.classList.remove('listening');
        };

        recognition.onend = () => {
            voiceBtn.classList.remove('listening');
        };
    } else {
        voiceBtn.style.display = 'none'; // Hide if not supported
    }

    voiceBtn.addEventListener('click', () => {
        if (recognition) {
            if (voiceBtn.classList.contains('listening')) {
                recognition.stop();
            } else {
                recognition.start();
            }
        }
    });

    // Image Upload Setup
    imgBtn.addEventListener('click', () => chatFileInput.click());

    chatFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            selectedChatFile = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                imgPreview.src = e.target.result;
                previewArea.style.display = 'flex';
            };
            reader.readAsDataURL(selectedChatFile);
        }
    });

    removeImgBtn.addEventListener('click', () => {
        selectedChatFile = null;
        chatFileInput.value = '';
        previewArea.style.display = 'none';
        imgPreview.src = '';
    });

    // Messages of the current chat session, sent with each question so follow-ups have context
    let chatHistory = [];
    const chatGreetingHtml = chatBox.innerHTML;

    document.getElementById('new-chat-btn').addEventListener('click', () => {
        chatHistory = [];
        chatBox.innerHTML = chatGreetingHtml;
        updateTranslations(window.globalLang);
    });

    function appendMessage(sender, text, imgSrc = null) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${sender}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.innerHTML = sender === 'bot' ? '<i class="ph ph-robot"></i>' : '<i class="ph ph-user"></i>';
        
        const content = document.createElement('div');
        content.className = 'msg-content';
        
        let innerHtml = '';
        if (imgSrc) {
            innerHtml += `<img src="${imgSrc}" alt="Attached image">`;
        }
        
        if (sender === 'bot' && window.marked) {
            innerHtml += marked.parse(text);
        } else if (text) {
            innerHtml += `<p>${text}</p>`;
        }
        
        content.innerHTML = innerHtml;

        msgDiv.appendChild(avatar);
        msgDiv.appendChild(content);
        chatBox.appendChild(msgDiv);
        
        // Scroll to bottom
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    async function handleSendMessage() {
        const message = chatInput.value.trim();
        if (!message && !selectedChatFile) return;

        // Display user message
        const imgSrc = selectedChatFile ? imgPreview.src : null;
        appendMessage('user', message, imgSrc);
        
        // Store and reset inputs
        const msgToSend = message;
        const fileToSend = selectedChatFile;
        
        chatInput.value = '';
        removeImgBtn.click(); // Reset image inputs
        
        // Add loading indicator
        const loadingId = 'loading-' + Date.now();
        appendMessage('bot', '<div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>');
        const loadingMsg = chatBox.lastElementChild;

        try {
            const formData = new FormData();
            if (msgToSend) formData.append('message', msgToSend);
            if (fileToSend) formData.append('image', fileToSend);
            formData.append('language', window.globalLang);
            formData.append('history', JSON.stringify(chatHistory));

            const response = await fetch('/api/chat', {
                method: 'POST',
                // Don't set Content-Type header; browser automatically sets it to multipart/form-data with boundary
                body: formData
            });
            const data = await response.json();
            
            // Remove loading
            chatBox.removeChild(loadingMsg);
            
            if (!response.ok) throw new Error(data.error || 'Failed to get response');
            
            appendMessage('bot', data.reply);
            chatHistory.push(
                { role: 'user', text: msgToSend || '(sent a photo)' },
                { role: 'assistant', text: data.reply }
            );
        } catch (error) {
            chatBox.removeChild(loadingMsg);
            appendMessage('bot', `**Error:** ${error.message}`);
        }
    }

    sendBtn.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSendMessage();
    });

    // --- Weather Logic ---
    const locationInput = document.getElementById('location-input');
    const weatherBtn = document.getElementById('weather-btn');
    const weatherVoiceBtn = document.getElementById('weather-voice-btn');
    const weatherLoader = document.getElementById('weather-loader');
    const weatherResults = document.getElementById('weather-results');
    
    // Elements to populate
    const wTemp = document.getElementById('w-temp');
    const wDesc = document.getElementById('w-desc');
    const wHumidity = document.getElementById('w-humidity');
    const wAdvisory = document.getElementById('w-advisory');
    const forecastGrid = document.getElementById('forecast-grid');

    // Weather Speech Recognition
    let weatherRecognition = null;
    if (SpeechRecognition) {
        weatherRecognition = new SpeechRecognition();
        weatherRecognition.continuous = false;
        weatherRecognition.interimResults = false;
        weatherRecognition.lang = 'en-US';

        weatherRecognition.onstart = () => {
            weatherVoiceBtn.classList.add('listening');
        };

        weatherRecognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            locationInput.value = transcript.replace(/[.,]/g, ''); // remove punctuation
            // Automatically trigger search
            weatherBtn.click();
        };

        weatherRecognition.onerror = (event) => {
            console.error('Weather speech error:', event.error);
            weatherVoiceBtn.classList.remove('listening');
        };

        weatherRecognition.onend = () => {
            weatherVoiceBtn.classList.remove('listening');
        };
    } else {
        weatherVoiceBtn.style.display = 'none';
    }

    weatherVoiceBtn.addEventListener('click', () => {
        if (weatherRecognition) {
            if (weatherVoiceBtn.classList.contains('listening')) {
                weatherRecognition.stop();
            } else {
                weatherRecognition.start();
            }
        }
    });

    locationInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') weatherBtn.click();
    });

    weatherBtn.addEventListener('click', async () => {
        const location = locationInput.value.trim();
        if (!location) {
            alert('Please enter a location');
            return;
        }

        weatherLoader.style.display = 'flex';
        weatherResults.style.display = 'none';

        try {
            const response = await fetch('/api/weather', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ location: location, language: window.globalLang })
            });
            const data = await response.json();
            
            if (!response.ok) throw new Error(data.error || 'Failed to fetch weather data');

            // Populate current weather
            wTemp.textContent = `${data.weather.temp}°C`;
            wDesc.textContent = data.weather.description;
            wHumidity.textContent = data.weather.humidity;
            
            // Populate Forecast
            forecastGrid.innerHTML = '';
            if (data.forecast && data.forecast.length > 0) {
                data.forecast.forEach(day => {
                    const dateObj = new Date(day.date);
                    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    
                    const card = document.createElement('div');
                    card.className = 'forecast-card';
                    card.innerHTML = `
                        <div class="forecast-date">${dayName}</div>
                        <div class="forecast-icon"><img src="https:${day.icon}" alt="${day.condition}"></div>
                        <div class="forecast-temp">${day.max_temp}° / ${day.min_temp}°</div>
                        <div class="forecast-desc">${day.condition}</div>
                    `;
                    forecastGrid.appendChild(card);
                });
            } else {
                forecastGrid.innerHTML = '<p>No forecast data available.</p>';
            }

            // Populate Advisory
            wAdvisory.innerHTML = window.marked ? marked.parse(data.advisory) : data.advisory;
            wAdvisory.dataset.lang = window.globalLang;
            
            // Show results
            weatherResults.style.display = 'flex';
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            weatherLoader.style.display = 'none';
        }
    });

    // --- Crop Guidebook Logic ---
    const cropInput = document.getElementById('crop-input');
    const soilInput = document.getElementById('soil-input');
    const cropVoiceBtn = document.getElementById('crop-voice-btn');
    const soilVoiceBtn = document.getElementById('soil-voice-btn');
    const generateGuideBtn = document.getElementById('generate-guide-btn');
    const guidebookLoader = document.getElementById('guidebook-loader');
    const guidebookResults = document.getElementById('guidebook-results');
    const guidebookDocument = document.getElementById('guidebook-document');
    const downloadPdfBtn = document.getElementById('download-pdf-btn');

    // Guidebook Speech Recognition Function
    function setupVoiceInput(btnElement, inputElement) {
        if (!SpeechRecognition) {
            btnElement.style.display = 'none';
            return;
        }
        
        let localRecog = new SpeechRecognition();
        localRecog.continuous = false;
        localRecog.interimResults = false;
        localRecog.lang = 'en-US';

        localRecog.onstart = () => btnElement.classList.add('listening');
        
        localRecog.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            inputElement.value = transcript.replace(/[.,]/g, '');
        };
        
        localRecog.onerror = (e) => {
            console.error('Speech error:', e);
            btnElement.classList.remove('listening');
        };
        
        localRecog.onend = () => btnElement.classList.remove('listening');

        btnElement.addEventListener('click', () => {
            if (btnElement.classList.contains('listening')) {
                localRecog.stop();
            } else {
                localRecog.start();
            }
        });
    }

    setupVoiceInput(cropVoiceBtn, cropInput);
    setupVoiceInput(soilVoiceBtn, soilInput);

    generateGuideBtn.addEventListener('click', async () => {
        const crop = cropInput.value.trim();
        const soil = soilInput.value.trim();
        
        if (!crop || !soil) {
            alert('Please enter both Crop Name and Soil Type.');
            return;
        }

        guidebookLoader.style.display = 'flex';
        guidebookResults.style.display = 'none';

        try {
            const response = await fetch('/api/guidebook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ crop: crop, soil: soil, language: globalLang })
            });
            const data = await response.json();
            
            if (!response.ok) throw new Error(data.error || 'Failed to generate guidebook');

            guidebookDocument.innerHTML = window.marked ? marked.parse(data.guide) : data.guide;
            guidebookDocument.dataset.lang = window.globalLang;
            showFollowBox(data.history_id);
            guidebookResults.style.display = 'block';
            
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            guidebookLoader.style.display = 'none';
        }
    });

    // --- Follow a guidebook as a day-by-day crop plan ---
    const followBox = document.getElementById('follow-box');
    const followDate = document.getElementById('follow-date');
    const followBtn = document.getElementById('follow-btn');
    let guideHistoryId = null;

    function localDateString(date = new Date()) {
        const pad = n => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    // historyId is null when the guide could not be saved (e.g. database down) — then it can't be followed
    function showFollowBox(historyId) {
        guideHistoryId = historyId;
        followBox.style.display = historyId ? 'flex' : 'none';
        followDate.value = localDateString();
        followBtn.disabled = false;
        followBtn.innerHTML = `<i class="ph-bold ph-check-circle"></i> <span>${t('followBtn')}</span>`;
    }

    // Shared by the guidebook page and the history detail page
    async function followGuide(historyId, startDate, btn) {
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="ph ph-spinner spin"></i> <span>${t('followCreating')}</span>`;
        try {
            const response = await fetch('/api/plans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history_id: historyId, start_date: startDate })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to follow plan');
            btn.innerHTML = `<i class="ph-bold ph-check"></i> <span>${t('followingMsg')}</span>`;
            if (window.loadPlans) window.loadPlans();
        } catch (error) {
            alert(`Error: ${error.message}`);
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    }

    followBtn.addEventListener('click', () => {
        if (guideHistoryId) followGuide(guideHistoryId, followDate.value, followBtn);
    });

    // PDF Download Logic
    downloadPdfBtn.addEventListener('click', () => {
        const element = document.getElementById('guidebook-document');
        const cropName = cropInput.value.trim() || 'Crop';
        
        const opt = {
            margin:       10,
            filename:     `${cropName}_Farming_Guide.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        // Add loading state to button
        const originalText = downloadPdfBtn.innerHTML;
        downloadPdfBtn.innerHTML = '<i class="ph ph-spinner spin"></i> Generating...';
        downloadPdfBtn.disabled = true;

        html2pdf().set(opt).from(element).save().then(() => {
            downloadPdfBtn.innerHTML = originalText;
            downloadPdfBtn.disabled = false;
        }).catch(err => {
            console.error('PDF Error:', err);
            alert('Error generating PDF.');
            downloadPdfBtn.innerHTML = originalText;
            downloadPdfBtn.disabled = false;
        });
    });

    // --- Farming Economics Logic ---
    const ecoCropInput = document.getElementById('eco-crop-input');
    const ecoCropVoiceBtn = document.getElementById('eco-crop-voice-btn');
    const ecoSizeInput = document.getElementById('eco-size-input');
    const ecoUnitSelect = document.getElementById('eco-unit-select');
    const calculateEcoBtn = document.getElementById('calculate-eco-btn');
    const economicsLoader = document.getElementById('economics-loader');
    const economicsResults = document.getElementById('economics-results');
    const economicsDocument = document.getElementById('economics-document');

    // Setup voice for crop input
    setupVoiceInput(ecoCropVoiceBtn, ecoCropInput);

    calculateEcoBtn.addEventListener('click', async () => {
        const crop = ecoCropInput.value.trim();
        const landSize = ecoSizeInput.value.trim();
        const unit = ecoUnitSelect.value;
        
        if (!crop || !landSize) {
            alert('Please enter both Crop Name and Land Size.');
            return;
        }

        if (isNaN(landSize) || parseFloat(landSize) <= 0) {
            alert('Please enter a valid positive number for Land Size.');
            return;
        }

        economicsLoader.style.display = 'flex';
        economicsResults.style.display = 'none';

        try {
            const response = await fetch('/api/economics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ crop: crop, land_size: landSize, unit: unit, language: globalLang })
            });
            const data = await response.json();
            
            if (!response.ok) throw new Error(data.error || 'Failed to calculate economics');

            economicsDocument.innerHTML = window.marked ? marked.parse(data.report) : data.report;
            economicsDocument.dataset.lang = window.globalLang;
            economicsResults.style.display = 'block';
            
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            economicsLoader.style.display = 'none';
        }
    });

    // PDF Download Logic for Economics
    const ecoDownloadPdfBtn = document.getElementById('eco-download-pdf-btn');
    if (ecoDownloadPdfBtn) {
        ecoDownloadPdfBtn.addEventListener('click', () => {
            const element = document.getElementById('economics-document');
            const cropName = ecoCropInput.value.trim() || 'Economics';
            
            const opt = {
                margin:       10,
                filename:     `${cropName}_Economics_Report.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            const originalText = ecoDownloadPdfBtn.innerHTML;
            ecoDownloadPdfBtn.innerHTML = '<i class="ph ph-spinner spin"></i> Generating...';
            ecoDownloadPdfBtn.disabled = true;

            html2pdf().set(opt).from(element).save().then(() => {
                ecoDownloadPdfBtn.innerHTML = originalText;
                ecoDownloadPdfBtn.disabled = false;
            }).catch(err => {
                console.error('PDF Error:', err);
                alert('Error generating PDF.');
                ecoDownloadPdfBtn.innerHTML = originalText;
                ecoDownloadPdfBtn.disabled = false;
            });
        });
    }

    // --- History Logic ---
    const historyListView = document.getElementById('history-list-view');
    const historyDetailView = document.getElementById('history-detail-view');
    const historyList = document.getElementById('history-list');
    const historyLoader = document.getElementById('history-loader');
    const historyEmpty = document.getElementById('history-empty');
    const historyDocument = document.getElementById('history-document');
    const historyBackBtn = document.getElementById('history-back-btn');
    const historyPdfBtn = document.getElementById('history-pdf-btn');
    const historyFilters = document.querySelectorAll('.history-filter');

    const HISTORY_ICONS = {
        disease: 'ph-scan',
        chat: 'ph-robot',
        weather: 'ph-cloud-sun',
        guidebook: 'ph-book-open',
        economics: 'ph-chart-line-up',
        schemes: 'ph-bank'
    };
    const historyFollowBtn = document.getElementById('history-follow-btn');
    let historyType = '';
    let currentHistoryItem = null;

    function formatDate(iso) {
        return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function daysLeft(iso) {
        return Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 86400000));
    }

    function showHistoryList() {
        historyDetailView.style.display = 'none';
        historyListView.style.display = 'block';
        currentHistoryItem = null;
    }

    window.loadHistory = async function () {
        showHistoryList();
        historyLoader.style.display = 'flex';
        historyEmpty.style.display = 'none';
        historyList.innerHTML = '';

        try {
            const url = historyType ? `/api/history?type=${historyType}` : '/api/history';
            const response = await fetch(url);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to load history');

            if (data.items.length === 0) {
                historyEmpty.style.display = 'block';
                return;
            }

            data.items.forEach(item => {
                const row = document.createElement('div');
                row.className = 'history-item';
                row.innerHTML = `
                    <div class="history-item-icon"><i class="ph ${HISTORY_ICONS[item.type] || 'ph-file'}"></i></div>
                    <div class="history-item-body">
                        <h4>${escapeHtml(item.title)}</h4>
                        <p>${formatDate(item.created_at)} · auto-deletes in ${daysLeft(item.expires_at)} days</p>
                    </div>
                    <button class="btn-icon history-delete" title="Delete"><i class="ph ph-trash"></i></button>
                `;
                row.addEventListener('click', () => openHistoryItem(item.id));
                row.querySelector('.history-delete').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm('Delete this item from your history?')) return;
                    const res = await fetch(`/api/history/${item.id}`, { method: 'DELETE' });
                    if (res.ok) {
                        row.remove();
                        if (!historyList.children.length) historyEmpty.style.display = 'block';
                    }
                });
                historyList.appendChild(row);
            });
        } catch (error) {
            historyList.innerHTML = `<p class="history-empty">${escapeHtml(error.message)}</p>`;
        } finally {
            historyLoader.style.display = 'none';
        }
    };

    // Turn a stored history entry back into a readable markdown document
    function historyToMarkdown(item) {
        const out = item.output || {};
        const inp = item.inputs || {};
        const header = `*${escapeHtml(formatDate(item.created_at))}*\n\n`;
        const list = (arr) => (arr || []).map(x => `- ${escapeHtml(x)}`).join('\n');

        switch (item.type) {
            case 'disease':
                return `# ${escapeHtml(item.title)}\n\n${header}` +
                    `**Image:** ${escapeHtml(inp.filename)}\n\n` +
                    `## Organic Remedies\n${list(out.remedies)}\n\n## Recommended Fertilizers\n${list(out.fertilizers)}`;
            case 'chat':
                return `# AI Assistant\n\n${header}### Question\n${escapeHtml(inp.message || '(image only)')}` +
                    `${inp.has_image ? ' 📷' : ''}\n\n### Answer\n${out.reply || ''}`;
            case 'weather': {
                const w = out.weather || {};
                const rows = (out.forecast || []).map(d =>
                    `| ${escapeHtml(d.date)} | ${escapeHtml(d.condition)} | ${d.min_temp}° / ${d.max_temp}° |`).join('\n');
                return `# ${escapeHtml(item.title)}\n\n${header}` +
                    `**Current:** ${w.temp}°C, ${escapeHtml(w.description)}, Humidity ${w.humidity}%\n\n` +
                    (rows ? `## Forecast\n| Date | Condition | Min / Max |\n|---|---|---|\n${rows}\n\n` : '') +
                    `## AI Crop Advisory\n${out.advisory || ''}`;
            }
            case 'guidebook':
                return `${header}${out.guide || ''}`;
            case 'economics':
            case 'schemes':
                return `${header}${out.report || ''}`;
            default:
                return header;
        }
    }

    async function openHistoryItem(id) {
        try {
            const response = await fetch(`/api/history/${id}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to load item');

            currentHistoryItem = data.item;
            const md = historyToMarkdown(data.item);
            historyDocument.innerHTML = window.marked ? marked.parse(md) : escapeHtml(md);
            historyDocument.dataset.lang = (data.item.inputs && data.item.inputs.language) || 'en';

            const isGuide = data.item.type === 'guidebook';
            historyFollowBtn.style.display = isGuide ? 'inline-flex' : 'none';
            historyFollowBtn.disabled = false;
            historyFollowBtn.innerHTML = `<i class="ph-bold ph-calendar-plus"></i> <span>${t('followBtn')}</span>`;

            historyListView.style.display = 'none';
            historyDetailView.style.display = 'block';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    }

    historyFilters.forEach(btn => {
        btn.addEventListener('click', () => {
            historyFilters.forEach(b => b.classList.toggle('active', b === btn));
            historyType = btn.dataset.type;
            window.loadHistory();
        });
    });

    historyBackBtn.addEventListener('click', showHistoryList);

    // Saved guidebooks can be followed from history; the sowing date defaults to today
    historyFollowBtn.addEventListener('click', () => {
        if (!currentHistoryItem) return;
        const date = prompt(t('sowingDatePrompt'), localDateString());
        if (date) followGuide(currentHistoryItem.id, date, historyFollowBtn);
    });

    function downloadPdf(element, filename, btn) {
        const opt = {
            margin:       10,
            filename:     filename,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner spin"></i> Generating...';
        btn.disabled = true;

        html2pdf().set(opt).from(element).save().then(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }).catch(err => {
            console.error('PDF Error:', err);
            alert('Error generating PDF.');
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
    }

    historyPdfBtn.addEventListener('click', () => {
        if (!currentHistoryItem) return;
        const safeName = currentHistoryItem.title.replace(/[^\w\- ]+/g, '').trim() || 'Report';
        downloadPdf(historyDocument, `${safeName}.pdf`, historyPdfBtn);
    });

    // --- Crop Plans Dashboard (home page) ---
    const plansDashboard = document.getElementById('plans-dashboard');
    const plansGrid = document.getElementById('plans-grid');
    let plans = [];
    const expandedPlans = new Set();

    function taskHtml(plan, task) {
        return `
            <label class="plan-task ${task.done ? 'done' : ''}">
                <input type="checkbox" data-plan="${plan.id}" data-index="${task.index}" ${task.done ? 'checked' : ''}>
                <span class="plan-task-day">${t('planDayShort', { n: task.day })}</span>
                <span class="plan-task-text"><strong>${escapeHtml(task.title)}</strong>${task.details ? `<small>${escapeHtml(task.details)}</small>` : ''}</span>
            </label>`;
    }

    function planCardHtml(plan) {
        const notStarted = plan.current_day < 1;
        const dayLabel = notStarted
            ? t('planStartsIn', { n: 1 - plan.current_day })
            : t('planDay', { n: Math.min(plan.current_day, plan.total_days), total: plan.total_days });

        let body = '';
        if (plan.completed) {
            body = `<p class="plan-done-msg"><i class="ph-fill ph-confetti"></i> ${t('planCompleted')}</p>`;
        } else {
            if (plan.overdue.length) {
                body += `<h5 class="plan-label overdue">${t('planOverdue')}</h5>` + plan.overdue.map(task => taskHtml(plan, task)).join('');
            }
            body += `<h5 class="plan-label">${t('planToday')}</h5>`;
            body += plan.today.length
                ? plan.today.map(task => taskHtml(plan, task)).join('')
                : `<p class="plan-empty">${t('planNoTaskToday')}</p>`;
            if (plan.upcoming.length) {
                body += `<h5 class="plan-label">${t('planUpcoming')}</h5>` + plan.upcoming.map(task => `
                    <div class="plan-upcoming"><span class="plan-task-day">${t('planDayShort', { n: task.day })}</span> ${escapeHtml(task.title)}</div>`).join('');
            }
        }

        const expanded = expandedPlans.has(plan.id);
        return `
            <div class="plan-card" data-plan-card="${plan.id}">
                <div class="plan-card-header">
                    <div>
                        <h4><i class="ph ph-plant"></i> ${escapeHtml(plan.crop)}</h4>
                        <p>${escapeHtml(plan.soil)} · ${t('sowingDateLabel')}: ${escapeHtml(plan.start_date)}</p>
                    </div>
                    <span class="plan-day-badge">${dayLabel}</span>
                </div>
                <div class="plan-progress"><div style="width: ${plan.progress}%"></div></div>
                <div class="plan-body">${body}</div>
                <div class="plan-timeline" style="display: ${expanded ? 'block' : 'none'};">
                    ${plan.tasks.map(task => taskHtml(plan, task)).join('')}
                </div>
                <div class="plan-actions">
                    <button class="btn-secondary" data-action="toggle"><i class="ph ph-list-checks"></i> ${expanded ? t('planHideAll') : t('planViewAll')}</button>
                    <button class="btn-secondary" data-action="guide"><i class="ph ph-book-open"></i> ${t('planViewGuide')}</button>
                    <button class="btn-secondary plan-stop" data-action="stop"><i class="ph ph-x-circle"></i> ${t('planStop')}</button>
                </div>
            </div>`;
    }

    window.renderPlans = function () {
        plansDashboard.style.display = plans.length ? 'block' : 'none';
        plansGrid.innerHTML = plans.map(planCardHtml).join('');
    };

    window.loadPlans = async function () {
        try {
            const response = await fetch('/api/plans');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            plans = data.plans;
            window.renderPlans();
        } catch (error) {
            console.error('Failed to load plans:', error);
        }
    };

    function replacePlan(updated) {
        plans = plans.map(p => p.id === updated.id ? updated : p);
        window.renderPlans();
    }

    plansGrid.addEventListener('change', async (e) => {
        const box = e.target.closest('input[type="checkbox"][data-plan]');
        if (!box) return;
        try {
            const response = await fetch(`/api/plans/${box.dataset.plan}/tasks/${box.dataset.index}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ done: box.checked })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            replacePlan(data.plan);
        } catch (error) {
            box.checked = !box.checked;
            alert(`Error: ${error.message}`);
        }
    });

    plansGrid.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const card = btn.closest('[data-plan-card]');
        const plan = plans.find(p => p.id === card.dataset.planCard);
        if (!plan) return;

        if (btn.dataset.action === 'toggle') {
            expandedPlans.has(plan.id) ? expandedPlans.delete(plan.id) : expandedPlans.add(plan.id);
            window.renderPlans();
        } else if (btn.dataset.action === 'stop') {
            if (!confirm(t('planStopConfirm', { crop: plan.crop }))) return;
            const response = await fetch(`/api/plans/${plan.id}`, { method: 'DELETE' });
            if (response.ok) {
                plans = plans.filter(p => p.id !== plan.id);
                window.renderPlans();
            }
        } else if (btn.dataset.action === 'guide') {
            const response = await fetch(`/api/plans/${plan.id}/guide`);
            const data = await response.json();
            if (!response.ok) return alert(`Error: ${data.error}`);
            guidebookDocument.innerHTML = window.marked ? marked.parse(data.guide) : escapeHtml(data.guide);
            guidebookDocument.dataset.lang = data.language;
            showFollowBox(null); // already following
            guidebookResults.style.display = 'block';
            switchTab('guidebook-section');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    window.loadPlans();

    // --- Government Schemes Finder ---
    const schemeNeedsEl = document.getElementById('scheme-needs');
    const findSchemesBtn = document.getElementById('find-schemes-btn');
    const schemesLoader = document.getElementById('schemes-loader');
    const schemesResults = document.getElementById('schemes-results');
    const schemesDocument = document.getElementById('schemes-document');
    const schemeStateInput = document.getElementById('scheme-state-input');
    const schemeCropsInput = document.getElementById('scheme-crops-input');

    // Values sent to the server stay in English; labels follow the selected language
    const SCHEME_NEEDS = translations.en.schemeNeeds;
    const selectedNeeds = new Set();

    window.renderSchemeNeeds = function () {
        const labels = t('schemeNeeds');
        schemeNeedsEl.innerHTML = SCHEME_NEEDS.map((need, i) => `
            <label class="scheme-need ${selectedNeeds.has(need) ? 'active' : ''}">
                <input type="checkbox" value="${escapeHtml(need)}" ${selectedNeeds.has(need) ? 'checked' : ''}>
                ${escapeHtml((Array.isArray(labels) && labels[i]) || need)}
            </label>`).join('');
    };

    schemeNeedsEl.addEventListener('change', (e) => {
        if (!e.target.value) return;
        e.target.checked ? selectedNeeds.add(e.target.value) : selectedNeeds.delete(e.target.value);
        e.target.closest('.scheme-need').classList.toggle('active', e.target.checked);
    });

    window.renderSchemeNeeds();
    setupVoiceInput(document.getElementById('scheme-state-voice-btn'), schemeStateInput);
    setupVoiceInput(document.getElementById('scheme-crops-voice-btn'), schemeCropsInput);

    findSchemesBtn.addEventListener('click', async () => {
        const state = schemeStateInput.value.trim();
        if (!state) {
            alert(t('schemeStateRequired'));
            return;
        }

        schemesLoader.style.display = 'flex';
        schemesResults.style.display = 'none';
        findSchemesBtn.disabled = true;

        try {
            const response = await fetch('/api/schemes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    state: state,
                    crops: schemeCropsInput.value.trim(),
                    land_size: document.getElementById('scheme-land-input').value.trim(),
                    unit: document.getElementById('scheme-unit-select').value,
                    category: document.getElementById('scheme-category-select').value,
                    social_category: document.getElementById('scheme-social-select').value,
                    woman: document.getElementById('scheme-woman-input').checked,
                    needs: [...selectedNeeds],
                    language: window.globalLang
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to find schemes');

            schemesDocument.innerHTML = window.marked ? marked.parse(data.report) : escapeHtml(data.report);
            schemesDocument.dataset.lang = window.globalLang;
            schemesDocument.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
            schemesResults.style.display = 'block';
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            schemesLoader.style.display = 'none';
            findSchemesBtn.disabled = false;
        }
    });

    document.getElementById('schemes-pdf-btn').addEventListener('click', (e) => {
        downloadPdf(schemesDocument, 'Government_Schemes.pdf', e.currentTarget);
    });
});
