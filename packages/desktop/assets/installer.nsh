; Custom NSIS hooks for Saiko Wallet installer
; Runs at the very start of .onInit — before the "app is running" mutex check.
; Force-kills any lingering Saiko Wallet processes so updates never get stuck.

!macro customInit
  ; Gracefully request close first
  nsExec::ExecToLog 'taskkill /IM "Saiko Wallet.exe"'
  Sleep 1500
  ; Force-kill anything still hanging (Electron helper processes etc.)
  nsExec::ExecToLog 'taskkill /F /IM "Saiko Wallet.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "Saiko Wallet Helper.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "Saiko Wallet Helper (GPU).exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "Saiko Wallet Helper (Renderer).exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "Saiko Wallet Helper (Plugin).exe" /T'
  Sleep 500
!macroend
