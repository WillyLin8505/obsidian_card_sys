$KEY_STR = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="

function Get-BaseValue($char) {
    return $KEY_STR.IndexOf($char)
}

$compressed = "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="

$length = $compressed.Length
$resetValue = 32

$dictionary = @{}
$enlargeIn = 4
$dictSize = 4
$numBits = 3
$entry = ""
$result = [System.Collections.Generic.List[string]]::new()

$dataVal = Get-BaseValue $compressed[0]
$dataPosition = $resetValue
$dataIndex = 1

for ($i = 0; $i -lt 3; $i++) {
    $dictionary[$i] = $i
}

function Read-Bit {
    $resb = $script:dataVal -band $script:dataPosition
    $script:dataPosition = $script:dataPosition -shr 1
    if ($script:dataPosition -eq 0) {
        $script:dataPosition = $resetValue
        $script:dataVal = Get-BaseValue $compressed[$script:dataIndex]
        $script:dataIndex++
    }
    if ($resb -gt 0) { return 1 } else { return 0 }
}

function Read-Bits($n) {
    $bits = 0
    $power = 1
    for ($j = 0; $j -lt $n; $j++) {
        $b = Read-Bit
        $bits = $bits -bor ($b * $power)
        $power = $power -shl 1
    }
    return $bits
}

$bits = Read-Bits 2
if ($bits -eq 0) {
    $c = [char](Read-Bits 8)
} elseif ($bits -eq 1) {
    $c = [char](Read-Bits 16)
} elseif ($bits -eq 2) {
    Write-Output "Empty result"
    exit
}

$c = [string]$c
$dictionary[3] = $c
$w = $c
$result.Add($c)

$running = $true
while ($running) {
    if ($dataIndex -gt $length) {
        $running = $false
        break
    }

    $bits = Read-Bits $numBits
    $cCode = $bits

    if ($cCode -eq 0) {
        $newChar = [string][char](Read-Bits 8)
        $dictionary[$dictSize] = $newChar
        $dictSize++
        $cCode = $dictSize - 1
        $enlargeIn--
    } elseif ($cCode -eq 1) {
        $newChar = [string][char](Read-Bits 16)
        $dictionary[$dictSize] = $newChar
        $dictSize++
        $cCode = $dictSize - 1
        $enlargeIn--
    } elseif ($cCode -eq 2) {
        $running = $false
        break
    }

    if ($enlargeIn -eq 0) {
        $enlargeIn = [Math]::Pow(2, $numBits)
        $numBits++
    }

    if ($dictionary.ContainsKey($cCode)) {
        $entry = [string]$dictionary[$cCode]
    } else {
        if ($cCode -eq $dictSize) {
            $entry = $w + $w[0]
        } else {
            Write-Output "Decompression error"
            exit
        }
    }

    $result.Add($entry)
    $dictionary[$dictSize] = $w + $entry[0]
    $dictSize++
    $enlargeIn--

    if ($enlargeIn -eq 0) {
        $enlargeIn = [Math]::Pow(2, $numBits)
        $numBits++
    }

    $w = $entry
}

$output = $result -join ""
$output | Out-File -FilePath "decompress_output.txt" -Encoding UTF8
Write-Output "Decompressed length: $($output.Length)"
Write-Output "Output saved to decompress_output.txt"
Write-Output "First 200 chars:"
Write-Output $output.Substring(0, [Math]::Min(200, $output.Length))
