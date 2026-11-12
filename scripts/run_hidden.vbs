' Runs a batch file with NO console window and waits for it to finish, so Task Scheduler still sees the real exit code and "do not start a new instance" still works.
' Used by the MacroFX scheduled tasks (CogLegs refresh, ReleaseReaction live): wscript.exe //B //Nologo run_hidden.vbs "<path to .bat>"
Set sh = CreateObject("WScript.Shell")
If WScript.Arguments.Count < 1 Then WScript.Quit 2
WScript.Quit sh.Run("cmd.exe /c """ & WScript.Arguments(0) & """", 0, True)
