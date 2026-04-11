; UAE Dirham Currency Symbol - AutoHotkey Script
; Shortcut: Ctrl+Alt+D
; 
; To use:
; 1. Install AutoHotkey from https://www.autohotkey.com/
; 2. Double-click this file to run it
; 3. Press Ctrl+Alt+D anywhere to insert the UAE Dirham symbol
;
; To run at Windows startup:
; 1. Press Win+R, type: shell:startup
; 2. Copy this file (or a shortcut to it) into that folder

#Requires AutoHotkey v2.0

; Ctrl+Alt+D = Insert UAE Dirham symbol (using icomoon font character)
^!d::
{
    ; Save current clipboard
    ClipSaved := A_Clipboard
    
    ; Copy the UAE Dirham character (from icomoon font at U+E900)
    A_Clipboard := Chr(0xE900)
    
    ; Paste it
    Send("^v")
    
    ; Wait a moment then restore clipboard
    Sleep(100)
    A_Clipboard := ClipSaved
}
