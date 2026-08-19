soundtrack.mp3 is the looping background track ("zone2-council-ambience",
~2:49), converted from the original WAV to mp3 to keep the download small.
It loops automatically once you press Start, and its volume is controlled
by the "Music" fader in the in-game Sound panel (gear icon, top right).

To swap in a different track, just replace this file (keep the name
soundtrack.mp3, or update the path in js/main.js — search for
"assets/audio/soundtrack.mp3"). If the file is ever missing, the browser
fails to load it silently and gameplay is unaffected — none of the sound
effects (steering blips, engine hum, shooting, ring chimes, asteroid pops,
level-up fanfare, etc.) depend on this file; those are all generated
procedurally in code.
