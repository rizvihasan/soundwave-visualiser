document.addEventListener('DOMContentLoaded', function() {
  // Audio context and variables
  let audioContext;
  let audioBuffer;
  let audioSource;
  let analyser;
  let file;
  let fileName = '';
  let isPlaying = false;
  let startTime = 0;
  let pausedAt = 0;
  let animationId;

  // DOM elements
  const dropArea = document.getElementById('dropArea');
  const audioFileInput = document.getElementById('audioFile');
  const playButton = document.getElementById('playButton');
  const pauseButton = document.getElementById('pauseButton');
  const stopButton = document.getElementById('stopButton');
  const visualizerCanvas = document.getElementById('visualizer');
  const visualizerContext = visualizerCanvas.getContext('2d');
  const currentTimeElement = document.getElementById('currentTime');
  const totalTimeElement = document.getElementById('totalTime');
  const visualizationType = document.getElementById('visualizationType');
  const songTitle = document.getElementById('songTitle');
  const songInfo = document.getElementById('songInfo');
  const songDuration = document.getElementById('songDuration');
  const loading = document.getElementById('loading');
  const errorMessage = document.getElementById('errorMessage');

  // Initialize audio context
  function initAudioContext() {
    try {
      window.AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContext();
    } catch (e) {
      showError('Web Audio API is not supported in this browser');
    }
  }

  // Set up drag and drop
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, highlight, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, unhighlight, false);
  });

  function highlight() {
    dropArea.style.borderColor = '#1DB954';
  }

  function unhighlight() {
    dropArea.style.borderColor = '#666';
  }

  dropArea.addEventListener('drop', handleDrop, false);

  function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;

    if (files.length) {
      handleFiles(files);
    }
  }

  audioFileInput.addEventListener('change', function() {
    if (this.files.length) {
      handleFiles(this.files);
    }
  });

  // Handle selected files
  function handleFiles(files) {
    file = files[0];

    // Check if file is audio
    if (!file.type.match('audio.*')) {
      showError('Please select an audio file');
      return;
    }

    hideError();
    fileName = file.name;
    songTitle.textContent = fileName;
    songInfo.style.display = 'block';
    loading.style.display = 'block';

    // Initialize audio context if needed
    if (!audioContext) {
      initAudioContext();
    }

    // Stop any currently playing audio
    if (isPlaying) {
      stopAudio();
    }

    const reader = new FileReader();

    reader.onload = function(e) {
      const audioData = e.target.result;

      audioContext.decodeAudioData(audioData)
        .then(buffer => {
          audioBuffer = buffer;
          const duration = formatTime(buffer.duration);
          totalTimeElement.textContent = duration;
          songDuration.textContent = `Duration: ${duration}`;

          // Enable controls
          playButton.disabled = false;
          pauseButton.disabled = true;
          stopButton.disabled = true;

          // Draw initial waveform
          drawWaveform();

          loading.style.display = 'none';
        })
        .catch(err => {
          showError('Error decoding audio data: ' + err.message);
          loading.style.display = 'none';
        });
    };

    reader.onerror = function() {
      showError('Error reading file');
      loading.style.display = 'none';
    };

    reader.readAsArrayBuffer(file);
  }

  // Play, pause, stop controls
  playButton.addEventListener('click', function() {
    if (!audioBuffer) return;

    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    playAudio();

    playButton.disabled = true;
    pauseButton.disabled = false;
    stopButton.disabled = false;
  });

  pauseButton.addEventListener('click', function() {
    if (isPlaying) {
      pauseAudio();

      playButton.disabled = false;
      pauseButton.disabled = true;
    }
  });

  stopButton.addEventListener('click', function() {
    if (audioBuffer) {
      stopAudio();

      playButton.disabled = false;
      pauseButton.disabled = true;
      stopButton.disabled = true;
    }
  });

  // Visualization type change
  visualizationType.addEventListener('change', function() {
    if (isPlaying) {
      drawVisualizer();
    } else if (audioBuffer) {
      drawWaveform();
    }
  });

  // Audio control functions
  function playAudio() {
    // Create a new audio source
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;

    // Create analyzer
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;

    // Connect nodes
    audioSource.connect(analyser);
    analyser.connect(audioContext.destination);

    // Start playback
    if (pausedAt) {
      startTime = audioContext.currentTime - pausedAt;
      audioSource.start(0, pausedAt);
    } else {
      startTime = audioContext.currentTime;
      audioSource.start(0);
    }

    isPlaying = true;

    // Visualize
    drawVisualizer();

    // When playback ends
    audioSource.onended = function() {
      if (isPlaying) {
        stopAudio();
        playButton.disabled = false;
        pauseButton.disabled = true;
        stopButton.disabled = true;
      }
    };
  }

  function pauseAudio() {
    if (audioSource) {
      audioSource.stop();
      pausedAt = audioContext.currentTime - startTime;
      isPlaying = false;
      cancelAnimationFrame(animationId);
    }
  }

  function stopAudio() {
    if (audioSource) {
      audioSource.stop();
    }
    isPlaying = false;
    pausedAt = 0;
    currentTimeElement.textContent = '0:00';
    cancelAnimationFrame(animationId);
    drawWaveform();
  }

  // Draw initial waveform of the audio file
  function drawWaveform() {
    if (!audioBuffer) return;

    // Set canvas dimensions
    setCanvasDimensions();

    // Get the audio data
    const channelData = audioBuffer.getChannelData(0);
    const step = Math.ceil(channelData.length / visualizerCanvas.width);

    visualizerContext.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
    visualizerContext.beginPath();

    const type = visualizationType.value;

    if (type === 'waveform') {
      // Draw waveform
      visualizerContext.strokeStyle = '#1DB954';
      visualizerContext.lineWidth = 2;

      for (let i = 0; i < visualizerCanvas.width; i++) {
        const index = Math.floor(i * step);
        const value = channelData[index] * 0.9;
        const y = (0.5 + value * 0.5) * visualizerCanvas.height;

        if (i === 0) {
          visualizerContext.moveTo(i, y);
        } else {
          visualizerContext.lineTo(i, y);
        }
      }

      visualizerContext.stroke();
    } else if (type === 'bars') {
      // Draw simplified amplitude bars
      const barWidth = 3;
      const gap = 1;
      const barCount = Math.floor(visualizerCanvas.width / (barWidth + gap));
      const barStep = Math.floor(channelData.length / barCount);

      visualizerContext.fillStyle = '#1DB954';

      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        for (let j = 0; j < barStep; j++) {
          const index = i * barStep + j;
          if (index < channelData.length) {
            sum += Math.abs(channelData[index]);
          }
        }
        const average = sum / barStep;
        const height = average * visualizerCanvas.height * 3;
        const x = i * (barWidth + gap);
        const y = visualizerCanvas.height - height;

        visualizerContext.fillRect(x, y, barWidth, height);
      }
    } else if (type === 'circle') {
      // Draw simplified circle amplitude
      const centerX = visualizerCanvas.width / 2;
      const centerY = visualizerCanvas.height / 2;
      const radius = Math.min(centerX, centerY) * 0.5;

      visualizerContext.strokeStyle = '#1DB954';
      visualizerContext.lineWidth = 2;

      const samples = 100;
      const angleStep = (Math.PI * 2) / samples;

      visualizerContext.beginPath();

      for (let i = 0; i <= samples; i++) {
        const angle = i * angleStep;
        const index = Math.floor((i / samples) * channelData.length);
        const value = Math.abs(channelData[index]);
        const adjustedRadius = radius + value * radius * 2;

        const x = centerX + Math.cos(angle) * adjustedRadius;
        const y = centerY + Math.sin(angle) * adjustedRadius;

        if (i === 0) {
          visualizerContext.moveTo(x, y);
        } else {
          visualizerContext.lineTo(x, y);
        }
      }

      visualizerContext.closePath();
      visualizerContext.stroke();
    } else if (type === 'frequency') {
      // Draw simplified frequency spectrum approximation
      visualizerContext.fillStyle = '#1DB954';

      const sampleSize = 1024;
      const barWidth = 4;
      const gap = 1;
      const barCount = Math.floor(visualizerCanvas.width / (barWidth + gap));

      for (let i = 0; i < barCount; i++) {
        const startIndex = Math.floor((i / barCount) * channelData.length);
        const endIndex = Math.floor(((i + 1) / barCount) * channelData.length);

        let sum = 0;
        let count = 0;

        for (let j = startIndex; j < endIndex && j < channelData.length; j++) {
          sum += Math.abs(channelData[j]);
          count++;
        }

        const average = count > 0 ? sum / count : 0;
        const height = Math.pow(average, 0.8) * visualizerCanvas.height * 4;
        const x = i * (barWidth + gap);
        const y = visualizerCanvas.height - height;

        visualizerContext.fillRect(x, y, barWidth, height);
      }
    }
  }

  // Real-time visualization
  function drawVisualizer() {
    if (!isPlaying) return;

    animationId = requestAnimationFrame(drawVisualizer);

    // Set canvas dimensions
    setCanvasDimensions();

    // Update time display
    const currentTime = pausedAt + audioContext.currentTime - startTime;
    currentTimeElement.textContent = formatTime(currentTime);

    // Get frequency data
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const type = visualizationType.value;

    if (type === 'waveform' || type === 'bars' || type === 'circle') {
      analyser.getByteTimeDomainData(dataArray);
    } else {
      analyser.getByteFrequencyData(dataArray);
    }

    visualizerContext.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);

    if (type === 'waveform') {
      // Draw waveform
      visualizerContext.lineWidth = 2;
      visualizerContext.strokeStyle = '#1DB954';
      visualizerContext.beginPath();

      const sliceWidth = visualizerCanvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * visualizerCanvas.height / 2;

        if (i === 0) {
          visualizerContext.moveTo(x, y);
        } else {
          visualizerContext.lineTo(x, y);
        }

        x += sliceWidth;
      }

      visualizerContext.lineTo(visualizerCanvas.width, visualizerCanvas.height / 2);
      visualizerContext.stroke();
    } else if (type === 'frequency') {
      // Draw frequency bars
      const barWidth = (visualizerCanvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * visualizerCanvas.height;

        // Color gradient based on frequency
        const hue = i / bufferLength * 180 + 120;
        visualizerContext.fillStyle = `hsl(${hue}, 100%, 50%)`;

        visualizerContext.fillRect(x, visualizerCanvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    } else if (type === 'bars') {
      // Draw amplitude bars
      const barCount = 64;
      const barWidth = visualizerCanvas.width / barCount - 1;
      let x = 0;

      for (let i = 0; i < barCount; i++) {
        const index = Math.floor(i * bufferLength / barCount);
        const value = dataArray[index] / 128.0 - 1;
        const barHeight = Math.abs(value) * visualizerCanvas.height * 0.8;

        visualizerContext.fillStyle = '#1DB954';

        visualizerContext.fillRect(
          x,
          visualizerCanvas.height / 2 - barHeight / 2,
          barWidth,
          barHeight
        );

        x += barWidth + 1;
      }
    } else if (type === 'circle') {
      // Draw circular visualizer
      const centerX = visualizerCanvas.width / 2;
      const centerY = visualizerCanvas.height / 2;
      const radius = Math.min(centerX, centerY) * 0.7;

      visualizerContext.beginPath();
      visualizerContext.arc(centerX, centerY, radius * 0.3, 0, Math.PI * 2);
      visualizerContext.fillStyle = '#333';
      visualizerContext.fill();

      const barCount = 64;
      const angleStep = (Math.PI * 2) / barCount;

      for (let i = 0; i < barCount; i++) {
        const index = Math.floor(i * bufferLength / barCount);
        const value = dataArray[index] / 255;
        const barHeight = value * radius * 0.7;

        const angle = i * angleStep;

        const startX = centerX + Math.cos(angle) * radius * 0.3;
        const startY = centerY + Math.sin(angle) * radius * 0.3;

        const endX = centerX + Math.cos(angle) * (radius * 0.3 + barHeight);
        const endY = centerY + Math.sin(angle) * (radius * 0.3 + barHeight);

        // Color gradient based on position
        const hue = i / barCount * 360;
        visualizerContext.strokeStyle = `hsl(${hue}, 100%, 50%)`;
        visualizerContext.lineWidth = 2;

        visualizerContext.beginPath();
        visualizerContext.moveTo(startX, startY);
        visualizerContext.lineTo(endX, endY);
        visualizerContext.stroke();
      }
    }
  }

  // Helper functions
  function setCanvasDimensions() {
    visualizerCanvas.width = visualizerCanvas.clientWidth;
    visualizerCanvas.height = visualizerCanvas.clientHeight;
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
  }

  function hideError() {
    errorMessage.style.display = 'none';
  }

  // Set initial canvas dimensions
  window.addEventListener('resize', setCanvasDimensions);
  setCanvasDimensions();

  // Initialize application
  initAudioContext();
});
