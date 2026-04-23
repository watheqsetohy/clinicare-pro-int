$body = @{
  brand        = "Lisinopril 10mg"
  name         = "Lisinopril 10mg"
  clinicalDrug = "Lisinopril (ACE Inhibitor)"
  dose         = "10 mg"
  route        = "PO"
  frequency    = "Once Daily"
  dosing       = "10 mg PO Once Daily (morning, with or without food)"
  tag          = "Chronic"
  rxNorm       = "314076"
  status       = "Active"
  startDate    = "2024-03-01"
  prescriber   = "Dr. Sarah Connor"
  indication   = "Hypertension"
  instructions = "Take 1 tablet by mouth once daily in the morning. Rise slowly to avoid dizziness. Avoid potassium supplements unless directed by physician."
  recommendations = "Monitor BP weekly for first month. Target BP below 130/80 mmHg. Check renal function and electrolytes in 2 weeks."
  indications  = @("Essential Hypertension", "Chronic Kidney Disease (Renoprotective)", "Post-MI Cardioprotection")
  cdss         = @(
    @{
      type   = "warn"
      label  = "K+ Monitoring Required"
      detail = "ACE Inhibitors can elevate serum potassium. Monitor K+ every 2-4 weeks during initiation. Threshold: K+ > 5.5 mEq/L warrants dose reduction."
    },
    @{
      type   = "info"
      label  = "Dry Cough (15% incidence)"
      detail = "Up to 15% of patients develop a persistent dry cough. If intolerable, consider switching to an ARB (e.g., Losartan 50mg). Document and inform prescriber."
    }
  )
} | ConvertTo-Json -Depth 5

$result = Invoke-RestMethod -Uri 'http://localhost:3001/api/patients/P75544/medications' -Method POST -ContentType 'application/json' -Body $body
Write-Host "Result: $($result | ConvertTo-Json)"
