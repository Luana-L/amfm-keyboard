document.addEventListener("DOMContentLoaded", function () {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        const keyboardFrequencyMap = {
                '90': 261.625565300598634,  // Z - C
                '83': 277.182630976872096,  // S - C#
                '88': 293.664767917407560,  // X - D
                '68': 311.126983722080910,  // D - D#
                '67': 329.627556912869929,  // C - E
                '86': 349.228231433003884,  // V - F
                '71': 369.994422711634398,  // G - F#
                '66': 391.995435981749294,  // B - G
                '72': 415.304697579945138,  // H - G#
                '78': 440.000000000000000,  // N - A
                '74': 466.163761518089916,  // J - A#
                '77': 493.883301256124111,  // M - B
                '81': 523.251130601197269,  // Q - C
                '50': 554.365261953744192,  // 2 - C#
                '87': 587.329535834815120,  // W - D
                '51': 622.253967444161821,  // 3 - D#
                '69': 659.255113825739859,  // E - E
                '82': 698.456462866007768,  // R - F
                '53': 739.988845423268797,  // 5 - F#
                '84': 783.990871963498588,  // T - G
                '54': 830.609395159890277,  // 6 - G#
                '89': 880.000000000000000,  // Y - A
                '55': 932.327523036179832,  // 7 - A#
                '85': 987.766602512248223   // U - B
        };

        const activeOscillators = {};
        const activeGainNodes = {};

        const globalGain = audioCtx.createGain();
        globalGain.gain.setValueAtTime(0.8, audioCtx.currentTime);
        globalGain.connect(audioCtx.destination);

        let waveformType = 'sine';

        const MAX_VOICES = 8;
        const VOICE_GAIN = 1 / MAX_VOICES;

        function playNote(key) {
                if (!keyboardFrequencyMap[key]) return;
                if (activeOscillators[key]) return;

                const osc = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                const now = audioCtx.currentTime;

                osc.type = waveformType;
                osc.frequency.setValueAtTime(keyboardFrequencyMap[key], now);

                osc.connect(gainNode);
                gainNode.connect(globalGain);

                const attack = 0.05;
                const decay = 0.2;
                const sustain = 0.3;

                gainNode.gain.cancelScheduledValues(now);
                gainNode.gain.setValueAtTime(0.0001, now);
                gainNode.gain.exponentialRampToValueAtTime(VOICE_GAIN, now + attack);
                gainNode.gain.exponentialRampToValueAtTime(
                        VOICE_GAIN * sustain,
                        now + attack + decay
                );

                osc.start(now);

                activeOscillators[key] = osc;
                activeGainNodes[key] = gainNode;

                updateViz();
        }

        function stopVoice(key, immediate = false) {
                const osc = activeOscillators[key];
                const gainNode = activeGainNodes[key];
                if (!osc || !gainNode) return;

                const now = audioCtx.currentTime;
                const release = immediate ? 0.02 : 0.15;

                gainNode.gain.cancelScheduledValues(now);
                gainNode.gain.setValueAtTime(gainNode.gain.value, now);
                gainNode.gain.setTargetAtTime(0.0001, now, release);

                osc.stop(now + release * 6);

                delete activeOscillators[key];
                delete activeGainNodes[key];

                updateViz();
        }

        // Keyboard input
        window.addEventListener("keydown", (e) => {
                const key = e.which.toString();
                if (!keyboardFrequencyMap[key]) return;
                playNote(key);
                const el = document.querySelector(`.key[data-key="${key}"]`);
                if (el) el.classList.add("active");
        });

        window.addEventListener("keyup", (e) => {
                const key = e.which.toString();
                stopVoice(key);
                const el = document.querySelector(`.key[data-key="${key}"]`);
                if (el) el.classList.remove("active");
        });

        // Release all on blur (prevents stuck notes)
        window.addEventListener("blur", () => {
                for (const key in activeOscillators) {
                        stopVoice(key, true);
                        const el = document.querySelector(`.key[data-key="${key}"]`);
                        if (el) el.classList.remove("active");
                }
        });

        // Waveform dropdown
        const waveformSelect = document.getElementById("waveform-select");
        if (waveformSelect) {
                waveformType = waveformSelect.value;
                waveformSelect.addEventListener("change", (e) => {
                        waveformType = e.target.value;
                });
        }

        // UI Keyboard
        const keyboardDiv = document.getElementById("keyboard");
        const viz = document.getElementById("viz");

        // Define octaves with white keys and black keys
        // Each octave: [white keys array, black keys array with positions]
        const octaves = [
                {
                        // Upper octave (Q-U row)
                        white: [
                                { code: '81', note: 'C', label: 'Q' },
                                { code: '87', note: 'D', label: 'W' },
                                { code: '69', note: 'E', label: 'E' },
                                { code: '82', note: 'F', label: 'R' },
                                { code: '84', note: 'G', label: 'T' },
                                { code: '89', note: 'A', label: 'Y' },
                                { code: '85', note: 'B', label: 'U' }
                        ],
                        black: [
                                { code: '50', note: 'C#', label: '2', position: 35 },  // Between C-D
                                { code: '51', note: 'D#', label: '3', position: 85 },  // Between D-E
                                { code: '53', note: 'F#', label: '5', position: 185 }, // Between F-G
                                { code: '54', note: 'G#', label: '6', position: 235 }, // Between G-A
                                { code: '55', note: 'A#', label: '7', position: 285 }  // Between A-B
                        ]
                },
                {
                        // Lower octave (Z-M row)
                        white: [
                                { code: '90', note: 'C', label: 'Z' },
                                { code: '88', note: 'D', label: 'X' },
                                { code: '67', note: 'E', label: 'C' },
                                { code: '86', note: 'F', label: 'V' },
                                { code: '66', note: 'G', label: 'B' },
                                { code: '78', note: 'A', label: 'N' },
                                { code: '77', note: 'B', label: 'M' }
                        ],
                        black: [
                                { code: '83', note: 'C#', label: 'S', position: 35 },  // Between C-D
                                { code: '68', note: 'D#', label: 'D', position: 85 },  // Between D-E
                                { code: '71', note: 'F#', label: 'G', position: 185 }, // Between F-G
                                { code: '72', note: 'G#', label: 'H', position: 235 }, // Between G-A
                                { code: '74', note: 'A#', label: 'J', position: 285 }  // Between A-B
                        ]
                }
        ];

        function createKey(keyData, isBlack, position = null) {
                const keyDiv = document.createElement("div");
                keyDiv.className = isBlack ? "key black" : "key white";
                keyDiv.textContent = keyData.label;
                keyDiv.dataset.key = keyData.code;

                if (isBlack && position !== null) {
                        keyDiv.style.left = position + 'px';
                }

                keyDiv.addEventListener("mousedown", () => {
                        playNote(keyData.code);
                        keyDiv.classList.add("active");
                });

                keyDiv.addEventListener("mouseup", () => {
                        stopVoice(keyData.code);
                        keyDiv.classList.remove("active");
                });

                keyDiv.addEventListener("mouseleave", () => {
                        stopVoice(keyData.code);
                        keyDiv.classList.remove("active");
                });

                return keyDiv;
        }

        octaves.forEach(octave => {
                const octaveDiv = document.createElement("div");
                octaveDiv.className = "octave";

                // Add white keys
                octave.white.forEach(keyData => {
                        octaveDiv.appendChild(createKey(keyData, false));
                });

                // Add black keys on top
                octave.black.forEach(keyData => {
                        octaveDiv.appendChild(createKey(keyData, true, keyData.position));
                });

                keyboardDiv.appendChild(octaveDiv);
        });

        function freqToHue(freq) {
                const minF = 260;
                const maxF = 1000;
                const t = Math.min(1, Math.max(0, (freq - minF) / (maxF - minF)));
                return 200 - t * 180;
        }

        function updateViz() {
                const keys = Object.keys(activeOscillators);
                const count = keys.length;

                if (!viz) return;

                if (count === 0) {
                        viz.style.opacity = 0;
                        return;
                }

                let avgFreq = 0;
                keys.forEach(k => avgFreq += keyboardFrequencyMap[k]);
                avgFreq /= count;

                const hue = freqToHue(avgFreq);
                const size = 200 + count * 80;
                const opacity = Math.min(0.7, 0.2 + count * 0.6);

                viz.style.width = size + "px";
                viz.style.height = size + "px";
                viz.style.marginLeft = -(size / 2) + "px";
                viz.style.marginTop = -(size / 2) + "px";
                viz.style.left = "50%";
                viz.style.top = "50%";
                viz.style.background = `radial-gradient(circle, hsla(${hue}, 80%, 60%, 1), transparent 70%)`;
                viz.style.opacity = opacity;
        }
});
