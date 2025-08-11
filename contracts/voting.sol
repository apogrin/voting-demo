// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Simple On-Chain Voting (Classroom Demo)
/// @notice Instructor (contract owner) can create multiple-choice polls; each address can vote once per poll.
/// @dev No external dependencies; designed for easy use in Remix + testnets.
contract Voting {
    /* ─────────────────────────  Minimal Ownable  ───────────────────────── */
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /* ─────────────────────────────  Polls  ─────────────────────────────── */
    struct Poll {
        string question;
        string[] options;          // option labels
        uint256[] votes;           // parallel array of tallies
        bool isOpen;               // instructor can close to stop further voting
        mapping(address => bool) hasVoted; // per-poll voter tracking
    }

    // We keep polls in an array; Poll contains a mapping so we must access by storage reference.
    Poll[] private _polls;

    /* ─────────────────────────────  Events  ────────────────────────────── */
    event PollCreated(uint256 indexed pollId, string question, string[] options);
    event VoteCast(uint256 indexed pollId, address indexed voter, uint256 optionIndex);
    event PollClosed(uint256 indexed pollId);

    /* ───────────────────────────  Instructor API  ──────────────────────── */
    /// @notice Create a new poll with a question and 2–10 options.
    function createPoll(string calldata question, string[] calldata options) external onlyOwner returns (uint256 pollId) {
        require(bytes(question).length > 0, "Empty question");
        require(options.length >= 2 && options.length <= 10, "Need 2-10 options");

        _polls.push();
        pollId = _polls.length - 1;
        Poll storage p = _polls[pollId];

        p.question = question;
        p.isOpen = true;

        // Copy options from calldata into storage; set parallel vote array.
        for (uint256 i = 0; i < options.length; i++) {
            require(bytes(options[i]).length > 0, "Empty option");
            p.options.push(options[i]);
            p.votes.push(0);
        }

        emit PollCreated(pollId, question, p.options);
    }

    /// @notice Close a poll to prevent further voting (results remain readable).
    function closePoll(uint256 pollId) external onlyOwner {
        require(pollId < _polls.length, "Bad pollId");
        Poll storage p = _polls[pollId];
        require(p.isOpen, "Already closed");
        p.isOpen = false;
        emit PollClosed(pollId);
    }

    /* ─────────────────────────────  Voting  ────────────────────────────── */
    /// @notice Cast a vote for a given option on an open poll.
    function vote(uint256 pollId, uint256 optionIndex) external {
        require(pollId < _polls.length, "Bad pollId");
        Poll storage p = _polls[pollId];
        require(p.isOpen, "Poll closed");
        require(optionIndex < p.options.length, "Bad option");
        require(!p.hasVoted[msg.sender], "Already voted");

        p.hasVoted[msg.sender] = true;
        p.votes[optionIndex] += 1;

        emit VoteCast(pollId, msg.sender, optionIndex);
    }

    /* ─────────────────────────────  Views  ─────────────────────────────── */
    function getPollCount() external view returns (uint256) {
        return _polls.length;
    }

    /// @notice Read poll metadata and current tallies.
    /// @dev Returns copies of dynamic arrays for easy front-end consumption.
    function getPoll(uint256 pollId)
        external
        view
        returns (
            string memory question,
            string[] memory options,
            uint256[] memory votes,
            bool isOpen
        )
    {
        require(pollId < _polls.length, "Bad pollId");
        Poll storage p = _polls[pollId];

        question = p.question;
        isOpen = p.isOpen;

        // Copy dynamic arrays from storage to memory for return
        uint256 n = p.options.length;
        options = new string[](n);
        votes = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            options[i] = p.options[i];
            votes[i] = p.votes[i];
        }
    }

    /// @notice Check if an address has voted in a given poll.
    function hasVoted(uint256 pollId, address voter) external view returns (bool) {
        require(pollId < _polls.length, "Bad pollId");
        return _polls[pollId].hasVoted[voter];
    }

    /// @notice Number of options in a poll (handy for UI bounds).
    function getOptionCount(uint256 pollId) external view returns (uint256) {
        require(pollId < _polls.length, "Bad pollId");
        return _polls[pollId].options.length;
    }
}
