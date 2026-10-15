  Controls:
  tail -f ~/capsolver/.data/worldofnations.log          # watch it
  systemctl --user status worldofnations-vote          # state
  systemctl --user restart worldofnations-vote         # after editing code / .env
  systemctl --user disable --now worldofnations-vote   # stop for good