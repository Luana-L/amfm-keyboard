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

        // ─── Voice Storage ───
        const activeVoices = {};

        // ─── Synth Parameters ───
        const synthParams = {
                mode: 'additive',
                waveform: 'sine',
                // Additive
                additivePartials: 5,
                // AM
                amModFreq: 100,
                amDepth: 0.5,
                // FM
                fmModFreq: 200,
                fmModIndex: 2,
                // ADSR
                attack: 0.05,
                decay: 0.2,
                sustain: 0.3,
                release: 0.15,
                // LFO
                lfoRate: 5,
                lfoDepth: 0,
        };

        const MAX_VOICES = 8;
        const VOICE_GAIN = 1 / MAX_VOICES;

        // ─── Audio Routing ───
        const masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(0.7, audioCtx.currentTime);
        masterGain.connect(audioCtx.destination);

        // ─── Global LFO ───
        const lfo = audioCtx.createOscillator();
        lfo.frequency.setValueAtTime(synthParams.lfoRate, audioCtx.currentTime);
        lfo.start();

        // ─── Play Note ───
        function playNote(key) {
                if (!keyboardFrequencyMap[key]) return;
                if (activeVoices[key]) return;

                const freq = keyboardFrequencyMap[key];
                const now = audioCtx.currentTime;

                // Per-voice envelope gain
                const envGain = audioCtx.createGain();
                envGain.connect(masterGain);

                // ADSR: Attack → Decay → Sustain
                const targetGain = VOICE_GAIN;
                envGain.gain.setValueAtTime(0.0001, now);
                envGain.gain.exponentialRampToValueAtTime(targetGain, now + synthParams.attack);
                envGain.gain.exponentialRampToValueAtTime(
                        Math.max(targetGain * synthParams.sustain, 0.0001),
                        now + synthParams.attack + synthParams.decay
                );

                let oscillators = [];
                let extraNodes = [];

                switch (synthParams.mode) {
                        case 'additive': {
                                for (let i = 1; i <= synthParams.additivePartials; i++) {
                                        const osc = audioCtx.createOscillator();
                                        osc.type = synthParams.waveform;
                                        osc.frequency.setValueAtTime(freq * i, now);

                                        const partialGain = audioCtx.createGain();
                                        partialGain.gain.setValueAtTime(1 / (i * i), now);

                                        osc.connect(partialGain);
                                        partialGain.connect(envGain);
                                        osc.start(now);

                                        oscillators.push(osc);
                                        extraNodes.push(partialGain);
                                }
                                break;
                        }

                        case 'am': {
                                // Carrier → amNode → envGain
                                // Modulator → depthNode → amNode.gain
                                // amNode.gain = 1 + depth * modulator (-1..1)
                                const carrier = audioCtx.createOscillator();
                                carrier.type = synthParams.waveform;
                                carrier.frequency.setValueAtTime(freq, now);

                                const amNode = audioCtx.createGain();
                                amNode.gain.setValueAtTime(1.0, now);

                                const modulator = audioCtx.createOscillator();
                                modulator.type = 'sine';
                                modulator.frequency.setValueAtTime(synthParams.amModFreq, now);

                                const depthNode = audioCtx.createGain();
                                depthNode.gain.setValueAtTime(synthParams.amDepth, now);

                                modulator.connect(depthNode);
                                depthNode.connect(amNode.gain);

                                carrier.connect(amNode);
                                amNode.connect(envGain);

                                carrier.start(now);
                                modulator.start(now);

                                oscillators.push(carrier, modulator);
                                extraNodes.push(amNode, depthNode);
                                break;
                        }

                        case 'fm': {
                                // Modulator → modGainNode → carrier.frequency
                                // carrier.frequency = freq + modIndex * modFreq * sin(2π * modFreq * t)
                                const carrier = audioCtx.createOscillator();
                                carrier.type = synthParams.waveform;
                                carrier.frequency.setValueAtTime(freq, now);

                                const modulator = audioCtx.createOscillator();
                                modulator.type = 'sine';
                                modulator.frequency.setValueAtTime(synthParams.fmModFreq, now);

                                const modGainNode = audioCtx.createGain();
                                modGainNode.gain.setValueAtTime(
                                        synthParams.fmModIndex * synthParams.fmModFreq,
                                        now
                                );

                                modulator.connect(modGainNode);
                                modGainNode.connect(carrier.frequency);

                                carrier.connect(envGain);

                                carrier.start(now);
                                modulator.start(now);

                                oscillators.push(carrier, modulator);
                                extraNodes.push(modGainNode);
                                break;
                        }
                }

                // ─── Per-voice LFO (vibrato) ───
                if (synthParams.lfoDepth > 0) {
                        const lfoGain = audioCtx.createGain();
                        lfoGain.gain.setValueAtTime(synthParams.lfoDepth * freq * 0.03, now);
                        lfo.connect(lfoGain);
                        if (synthParams.mode === 'additive') {
                                oscillators.forEach(osc => lfoGain.connect(osc.frequency));
                        } else {
                                lfoGain.connect(oscillators[0].frequency);
                        }
                        extraNodes.push(lfoGain);
                }

                activeVoices[key] = { oscillators, envGain, extraNodes };
                updateViz();
        }

        // ─── Stop Voice ───
        function stopVoice(key, immediate = false) {
                const voice = activeVoices[key];
                if (!voice) return;

                const now = audioCtx.currentTime;
                const release = immediate ? 0.02 : synthParams.release;

                voice.envGain.gain.cancelScheduledValues(now);
                voice.envGain.gain.setValueAtTime(voice.envGain.gain.value, now);
                voice.envGain.gain.setTargetAtTime(0.0001, now, release / 3);

                const stopTime = now + release * 5;
                voice.oscillators.forEach(osc => {
                        try { osc.stop(stopTime); } catch (e) { /* already stopped */ }
                });

                // Clean up nodes after release finishes
                const cleanupDelay = (release * 5 + 0.2) * 1000;
                const nodes = voice.extraNodes;
                const env = voice.envGain;
                setTimeout(() => {
                        try { env.disconnect(); } catch (e) { }
                        nodes.forEach(n => { try { n.disconnect(); } catch (e) { } });
                }, cleanupDelay);

                delete activeVoices[key];
                updateViz();
        }

        // ─── Keyboard Events ───
        window.addEventListener("keydown", (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
                if (e.repeat) return;
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
                for (const key in activeVoices) {
                        stopVoice(key, true);
                        const el = document.querySelector(`.key[data-key="${key}"]`);
                        if (el) el.classList.remove("active");
                }
        });

        // ─── UI Keyboard Building ───
        const keyboardDiv = document.getElementById("keyboard");
        const viz = document.getElementById("viz");

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
                                { code: '50', note: 'C#', label: '2', position: 35 },
                                { code: '51', note: 'D#', label: '3', position: 85 },
                                { code: '53', note: 'F#', label: '5', position: 185 },
                                { code: '54', note: 'G#', label: '6', position: 235 },
                                { code: '55', note: 'A#', label: '7', position: 285 }
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
                                { code: '83', note: 'C#', label: 'S', position: 35 },
                                { code: '68', note: 'D#', label: 'D', position: 85 },
                                { code: '71', note: 'F#', label: 'G', position: 185 },
                                { code: '72', note: 'G#', label: 'H', position: 235 },
                                { code: '74', note: 'A#', label: 'J', position: 285 }
                        ]
                }
        ];

        function createKey(keyData, isBlack, position) {
                const keyDiv = document.createElement("div");
                keyDiv.className = isBlack ? "key black" : "key white";
                keyDiv.textContent = keyData.label;
                keyDiv.dataset.key = keyData.code;

                if (isBlack && position !== undefined) {
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

                octave.white.forEach(keyData => {
                        octaveDiv.appendChild(createKey(keyData, false));
                });

                octave.black.forEach(keyData => {
                        octaveDiv.appendChild(createKey(keyData, true, keyData.position));
                });

                keyboardDiv.appendChild(octaveDiv);
        });

        // ─── Visualizer ───
        function freqToHue(freq) {
                const minF = 260;
                const maxF = 1000;
                const t = Math.min(1, Math.max(0, (freq - minF) / (maxF - minF)));
                return 200 - t * 180;
        }

        function updateViz() {
                const keys = Object.keys(activeVoices);
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

        // ─── Control Panel Setup ───
        function setupControls() {
                // Synthesis mode radio buttons
                document.querySelectorAll('input[name="synth-mode"]').forEach(radio => {
                        radio.addEventListener('change', (e) => {
                                synthParams.mode = e.target.value;
                                updateControlVisibility();
                        });
                });

                // Waveform
                bindSelect('waveform-select', (val) => { synthParams.waveform = val; });

                // Additive: partials
                bindRange('partials', 'partials-val', (val) => {
                        synthParams.additivePartials = parseInt(val);
                }, (val) => val);

                // AM controls
                bindRange('am-freq', 'am-freq-val', (val) => {
                        synthParams.amModFreq = parseFloat(val);
                }, (val) => val + ' Hz');

                bindRange('am-depth', 'am-depth-val', (val) => {
                        synthParams.amDepth = parseFloat(val);
                }, (val) => parseFloat(val).toFixed(2));

                // FM controls
                bindRange('fm-freq', 'fm-freq-val', (val) => {
                        synthParams.fmModFreq = parseFloat(val);
                }, (val) => val + ' Hz');

                bindRange('fm-index', 'fm-index-val', (val) => {
                        synthParams.fmModIndex = parseFloat(val);
                }, (val) => parseFloat(val).toFixed(1));

                // ADSR
                bindRange('attack', 'attack-val', (val) => {
                        synthParams.attack = parseFloat(val);
                }, (val) => parseFloat(val).toFixed(2) + 's');

                bindRange('decay', 'decay-val', (val) => {
                        synthParams.decay = parseFloat(val);
                }, (val) => parseFloat(val).toFixed(2) + 's');

                bindRange('sustain', 'sustain-val', (val) => {
                        synthParams.sustain = parseFloat(val);
                }, (val) => parseFloat(val).toFixed(2));

                bindRange('release-ctrl', 'release-val', (val) => {
                        synthParams.release = parseFloat(val);
                }, (val) => parseFloat(val).toFixed(2) + 's');

                // LFO
                bindRange('lfo-rate', 'lfo-rate-val', (val) => {
                        synthParams.lfoRate = parseFloat(val);
                        lfo.frequency.setValueAtTime(synthParams.lfoRate, audioCtx.currentTime);
                }, (val) => parseFloat(val).toFixed(1) + ' Hz');

                bindRange('lfo-depth', 'lfo-depth-val', (val) => {
                        synthParams.lfoDepth = parseFloat(val);
                }, (val) => parseFloat(val).toFixed(2));

                // Volume
                bindRange('volume', 'volume-val', (val) => {
                        masterGain.gain.setValueAtTime(parseFloat(val), audioCtx.currentTime);
                }, (val) => parseFloat(val).toFixed(2));

                updateControlVisibility();

                // Blur controls after interaction so keyboard notes work immediately
                document.querySelectorAll('.controls input, .controls select').forEach(el => {
                        el.addEventListener('change', () => el.blur());
                });
        }

        function bindRange(inputId, displayId, onChange, formatDisplay) {
                const input = document.getElementById(inputId);
                const display = document.getElementById(displayId);
                if (!input) return;
                input.addEventListener('input', (e) => {
                        onChange(e.target.value);
                        if (display && formatDisplay) {
                                display.textContent = formatDisplay(e.target.value);
                        }
                });
        }

        function bindSelect(selectId, onChange) {
                const select = document.getElementById(selectId);
                if (!select) return;
                select.addEventListener('change', (e) => {
                        onChange(e.target.value);
                });
        }

        function updateControlVisibility() {
                const addCtrl = document.getElementById('additive-controls');
                const amCtrl = document.getElementById('am-controls');
                const fmCtrl = document.getElementById('fm-controls');

                if (addCtrl) addCtrl.style.display = synthParams.mode === 'additive' ? 'block' : 'none';
                if (amCtrl) amCtrl.style.display = synthParams.mode === 'am' ? 'block' : 'none';
                if (fmCtrl) fmCtrl.style.display = synthParams.mode === 'fm' ? 'block' : 'none';
        }

        setupControls();
});
