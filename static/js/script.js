document.addEventListener('DOMContentLoaded', () => {
    // Global Language State
    window.globalLang = 'en';
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
        updateTranslations(window.globalLang);
    }

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
        predictionText.textContent = data.prediction;

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
            guidebookResults.style.display = 'block';
            
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            guidebookLoader.style.display = 'none';
        }
    });

    // PDF Download Logic
    downloadPdfBtn.addEventListener('click', () => {
        const element = document.getElementById('guidebook-document');
        const cropName = cropInput.value.trim() || 'Crop';
        
        const opt = {
            margin:       10,
            filename:     `${cropName}_Farming_Guide.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 1, useCORS: true },
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
                html2canvas:  { scale: 1, useCORS: true },
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
});
