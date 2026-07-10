--[[
    ============================================================
    EFA Server Script — Database Integration
    ============================================================
    Same URL shape as ARFA, new response fields.
    GET /data/:userId now returns:
      username, country, teamName, hasStadiumPass, isBanned,
      isAM, isStaff, isDeveloper, isBoard, isOwner
    POST /submit/data only accepts identity: robloxId, username, country.
    Roles/bans/passes can ONLY change through the website panel.
    ============================================================
]]

local API_URL = "https://your-api.onrender.com"
local API_KEY = "match-your-env-API_KEY"

local HttpService = game:GetService("HttpService")

local function GetDatabase(plr)
	local result
	local attempts = 0
	repeat
		attempts += 1
		local ok, response = pcall(function()
			return HttpService:RequestAsync({
				Url = API_URL .. "/data/" .. plr.UserId,
				Method = "GET",
				Headers = { ["x-api-key"] = API_KEY }
			})
		end)
		if ok and response.Success then
			result = HttpService:JSONDecode(response.Body)
		else
			warn("[EFA] DB fetch failed for " .. plr.Name .. ", retrying...")
			task.wait(5)
		end
	until result or attempts >= 5
	return result
end

game.Players.PlayerAdded:Connect(function(plr)
	local db = GetDatabase(plr)
	if not db then
		warn("[EFA] No DB result for " .. plr.Name .. " — using defaults")
		db = {}
	end

	plr:SetAttribute("Country", db.country or "None")
	plr:SetAttribute("Team", db.teamName or "None")
	plr:SetAttribute("StadPass", db.hasStadiumPass == true)

	-- Topmost role: highest wins
	if db.isAM then plr:SetAttribute("Topmost", "Assistant Manager") end
	if db.isStaff then plr:SetAttribute("Topmost", "Staff") end
	if db.isDeveloper then plr:SetAttribute("Topmost", "Developer") end
	if db.isBoard then plr:SetAttribute("Topmost", "Board") end
	if db.isOwner then plr:SetAttribute("Topmost", "Owner") end

	if db.isBanned then
		plr:Kick("You are banned from EFA. Appeal on the website.")
	end
end)

game.Players.PlayerRemoving:Connect(function(plr)
	-- Country attribute may be set in-game via a country picker UI
	pcall(function()
		HttpService:RequestAsync({
			Url = API_URL .. "/submit/data",
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["x-api-key"] = API_KEY
			},
			Body = HttpService:JSONEncode({
				robloxId = plr.UserId,
				username = plr.Name,
				country = plr:GetAttribute("Country")
			})
		})
	end)
end)
